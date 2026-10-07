import * as yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CryptoHelperFactory } from '../services/CryptoHelperFactory.ts';
import { JsonFileEncoding } from "../services/FileDataHelper.ts";
import * as Constants from '../services/Constants.ts';
import * as InPlaceConstants from '../features/feature-inplace-encrypt/FeatureInplaceConstants.ts';
import { FeatureInplaceTextAnalysis } from '../features/feature-inplace-encrypt/featureInplaceTextAnalysis.ts';
import { SshKeyService } from '../services/SshKeyService.ts';

interface Listing {
    featureType: 'InPlace' | 'WholeNote';
    fullPath: string;
    relativePath: string;
    extension: string;
    content: string | undefined;
}

interface TestResult{
    listing: Listing;
    success: boolean;
    message: string;
}

interface DecryptResult{
    listing: Listing;
    success: boolean;
    message: string;
    outFile: string | undefined;
}

class ListCommandHandler {


    async argHandler( format : string ) {

        const cwd = process.cwd();

        let onStart : () => void;
        let onListing : (l:Listing) => void;
        let onEnd : () => void;

        const listings: Listing[] = [];


        if ( format === 'csv') {

            onStart = () => console.log( 'feature,fullPath,relativePath,extension' );
            onListing = (l) => console.log( `"${l.featureType}","${l.fullPath}","${l.relativePath}","${l.extension}"` );
            onEnd = () => {};

        } else if (format == 'json') {

            onStart = () => {};
            onListing = (l) => listings.push( l );
            onEnd = () => console.log( JSON.stringify( listings, null, 2 ) );

        } else if (format === 'table') {

            onStart = () => {};
            onListing = (l) => listings.push( l );
            onEnd = () => console.table( listings );

        }else{
            // Default
            onStart = () => {};
            onListing = (l) => console.log( `${l.relativePath}` );
            onEnd = () => {};
        }


        await this.output(
            cwd,
            onStart,
            onListing,
            onEnd
        );

    }

    async output(
        dir : string,
        startCallback : () => void,
        perItemCallback : (l:Listing) => void,
        endCallback : () => void
    ) : Promise<void> {
        startCallback();
        for await (const l of Utils.listings(dir, false)) {
            perItemCallback(l);
        }
        endCallback();
    }


}

class TestCommandHandler {

    async argHandler( onlyListFails:boolean ) {

        const key = await SshKeyService.getKeyOrNull();
        if ( key == null ){
            console.error( `ERROR: SSH key unavailable (${SshKeyService.lastErrorMessage || 'unknown reason'})` );
            return;
        }

        const cwd = process.cwd();

        for await (const listing of Utils.listings(cwd, true)) {

            if (listing.featureType == 'InPlace'){

                for await (const result of this.testForInPlaceDecryption( listing )) {
                    this.outputResult( result, onlyListFails );
                }

            } else if (listing.featureType == 'WholeNote'){

                const result = await this.testForWholeNoteDecryption( listing );
                this.outputResult( result, onlyListFails );

            }
        }

    }

    async * testForInPlaceDecryption( listing: Listing ) : AsyncIterableIterator<TestResult> {

        if ( listing.content == null ) {
            yield {
                listing,
                success: false,
                message: 'no content'
            };
            return;
        }

        const lines = listing.content!.split( '\n' );

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            const lineNo = lineIdx + 1;
            const reInplaceMatcher = /🔐(.*?)🔐/g;
            const matches = Array.from( line.matchAll( reInplaceMatcher ) );
            for (const match of matches) {

                const matchLoc = `line ${lineNo}, pos ${match.index!+1}`;

                const encryptedText = `🔐${match[1]}🔐`;

                const txtAnalysis = new FeatureInplaceTextAnalysis( encryptedText );
                if (!txtAnalysis.canDecrypt || txtAnalysis.decryptable == null ){
                    yield {
                        listing,
                        success: false,
                        message: `${matchLoc}, cannot decrypt`
                    };

                    continue;
                }

                const ch = CryptoHelperFactory.BuildFromDecryptableOrNull( txtAnalysis.decryptable );
                if ( ch == null ){
                    yield {
                        listing,
                        success: false,
                        message: `${matchLoc}, legacy format (no longer supported)`
                    };
                    continue;
                }

                const decryptedText = await ch.decryptFromBase64(txtAnalysis.decryptable.base64CipherText);
                yield {
                    listing,
                    success: decryptedText != null,
                    message: `${matchLoc}, ${decryptedText != null ? 'decrypted' : 'unable to decrypt'}`
                };

            }

        }

    }

    async testForWholeNoteDecryption( listing: Listing ) : Promise<TestResult> {
        if( listing.content == null || listing.content.length == 0 ){
            return {
                listing,
                success: false,
                message: 'no content'
            };
        }

        const fileData = JsonFileEncoding.decode( listing.content || '' );

        const ch = CryptoHelperFactory.BuildFromFileDataOrNull( fileData );
        if ( ch == null ){
            return {
                listing,
                success: false,
                message: 'legacy format (no longer supported)'
            };
        }

        const decoded = await ch.decryptFromBase64(fileData.encodedData);
        return {
            listing,
            success: decoded != null,
            message: decoded != null ? 'decrypted' : 'unable to decrypt'
        };
    }

    outputResult(result: TestResult, onlyListFails:boolean) {
        if (onlyListFails && result.success) {
            return;
        }
        console.log( `${result.success ? 'PASSED' : 'FAILED'} => ${result.listing.relativePath} => ${result.message} => ${result.listing.featureType}` );
    }

    outputResults(results: TestResult[], onlyListFails:boolean) {
        for (const result of results) {
            this.outputResult( result, onlyListFails );
        }
    }
}

class DecryptCommandHandler{
    async argHandler( outdir:string, dryrun:boolean ) {

        const key = await SshKeyService.getKeyOrNull();
        if ( key == null ){
            console.error( `ERROR: SSH key unavailable (${SshKeyService.lastErrorMessage || 'unknown reason'})` );
            return;
        }

        console.log( `decrypting${dryrun?' (dry run)':''}...` );

        const cwd = process.cwd();

        for await (const listing of Utils.listings(cwd, true)) {

            if (listing.featureType == 'InPlace'){

                 const result = await this.decryptInPlaceListing( listing, outdir, dryrun );
                 this.outputResult( result );

            } else if (listing.featureType == 'WholeNote'){

                const result = await this.decryptWholeNoteListing( listing, outdir, dryrun );
                this.outputResult( result );

            }
        }
    }

    async decryptInPlaceListing(listing: Listing, outdir: string, dryrun: boolean) : Promise<DecryptResult> {

        const lines = listing.content!.split( '\n' );
        const decryptedLines : string[] = [];

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {

            const line = lines[lineIdx];

            const lineNo = lineIdx + 1;

            const reInplaceMatchers = [
                /%%🔐(.*?)🔐%%/g,
                /🔐(.*?)🔐/g
            ]

            let decryptedLine = line;
            let matchCount = 0;
            let decryptedCount = 0;

            for (const reInplaceMatcher of reInplaceMatchers) {


                for await (const match of decryptedLine.matchAll( reInplaceMatcher ) ) {

                    matchCount++;

                    const matchLoc = `Line ${lineNo}, pos ${match.index!+1}`;

                    const matchedText = match[0];
                    const encryptedText = `🔐${match[1]}🔐`;

                    const txtAnalysis = new FeatureInplaceTextAnalysis( encryptedText );
                    if (!txtAnalysis.canDecrypt || txtAnalysis.decryptable == null ){
                        return {
                            listing,
                            success: false,
                            message: `ERROR: ${matchLoc}, cannot decrypt`,
                            outFile: undefined
                        };
                    }

                    const ch = CryptoHelperFactory.BuildFromDecryptableOrNull( txtAnalysis.decryptable );
                    if ( ch == null ){
                        return {
                            listing,
                            success: false,
                            message: `ERROR: ${matchLoc}, legacy format (no longer supported)`,
                            outFile: undefined
                        };
                    }

                    const decryptedText = await ch.decryptFromBase64(txtAnalysis.decryptable.base64CipherText);

                    if (decryptedText!==null){
                        decryptedCount ++;
                        decryptedLine = decryptedLine.replace( matchedText, decryptedText );
                    }

                }
            }

            if (matchCount != decryptedCount){
                return {
                    listing,
                    success: false,
                    message: `ERROR: Unable to decrypt all matches. Line ${lineNo}, match count ${matchCount} != decrypted count ${decryptedCount}`,
                    outFile: undefined
                };
            }

            decryptedLines.push( decryptedLine );

        }

        let outFile = path.join( outdir, listing.relativePath );

        if (!dryrun){
            const outFileDir = path.dirname( outFile );
            if (!fs.existsSync( outFileDir )){
                fs.mkdirSync( outFileDir, { recursive: true } );
            }
            fs.writeFileSync( outFile, decryptedLines.join( '\n' ) );
        }

        return Promise.resolve({
            listing,
            success: true,
            message: 'Decrypted',
            outFile: outFile
        });
    }

    outputResult(result: DecryptResult) {
        console.log( `${result.message} : ${result.listing.relativePath}${result.outFile == null ? '' : ' => `' + result.outFile + '`'}` );
    }

    async decryptWholeNoteListing(listing: Listing, outdir: string, dryrun:boolean ) : Promise<DecryptResult> {

        let outFile = path.join( outdir, listing.relativePath );

        // change extension
        const fileName = path.basename(outFile);
        const extension = path.extname(outFile);
        const newFileName = fileName.replace(extension, '.md');

        // final outfile
        outFile = path.join(path.dirname(outFile), newFileName);

        if (!dryrun){
            const outFileDir = path.dirname( outFile );
            if (!fs.existsSync( outFileDir )){
                fs.mkdirSync( outFileDir, { recursive: true } );
            }
        }

        if( listing.content == null || listing.content.length == 0 ){

            if (!dryrun){
                fs.writeFileSync( outFile, '' );
            }

            return {
                listing,
                success: true,
                message: 'WARN: Empty file',
                outFile: outFile
            };
        }

        const fileData = JsonFileEncoding.decode( listing.content || '' );

        const ch = CryptoHelperFactory.BuildFromFileDataOrNull( fileData );
        if ( ch == null ){
            return {
                listing,
                success: false,
                message: 'ERROR: legacy format (no longer supported)',
                outFile: undefined
            };
        }

        const decoded = await ch.decryptFromBase64(fileData.encodedData);
        if ( decoded != null ){
            if (!dryrun){
                fs.writeFileSync( outFile, decoded );
            }

            return {
                listing,
                success: true,
                message: `Decrypted`,
                outFile: outFile
            };
        }

        return {
            listing,
            success: false,
            message: `ERROR: Unable to decrypt`,
            outFile: undefined
        };
    }
}

class Utils{
    static async * walk( dir : string ) : AsyncIterableIterator<string> {

        for await (const d of await fs.promises.opendir(dir)) {
            const entry = path.join(dir, d.name);
            if (d.isDirectory()) {
                yield* Utils.walk(entry);
            } else if (d.isFile()){
                yield entry;
            }
        }
    }

    static async * listings( dir : string, includeContent: boolean ) : AsyncIterableIterator<Listing> {

        for await (const p of Utils.walk( dir )) {

            const ext = path.extname(p).toLowerCase().slice(1);

            // exit early if not a relevant file
            if ( !['md', ...Constants.ENCRYPTED_FILE_EXTENSIONS].includes( ext ) ){
                continue;
            }

            const relativePath = '.' + path.sep + path.relative(dir, p);
            const content = ( includeContent || ext == 'md' ) ? await fs.promises.readFile( p, 'utf8' ) : undefined;

            // could have inplace encrypted notes
            if ( ext == 'md' ){

                if (
                    content!.includes( InPlaceConstants._PREFIX_A_VISIBLE )
                    || content!.includes( InPlaceConstants._PREFIX_B_VISIBLE )
                ){
                    yield {
                        featureType: 'InPlace',
                        fullPath: p,
                        relativePath: relativePath,
                        extension: ext,
                        content: includeContent ? content : undefined
                    }
                }
                continue;
            }

            // must be whole note encrypted
            yield {
                featureType: 'WholeNote',
                fullPath: p,
                relativePath: relativePath,
                extension: ext,
                content: content
            }

        }

    }

}

const optListingFormat : yargs.Options = {
    alias: 'f',
    describe: 'format of the listing',
    type: 'string',
    choices: [ 'default', 'table', 'json', 'csv'],
    default: 'default',
}



yargs.default(hideBin(process.argv))
    .scriptName('mdenc')
    .usage( 'Usage: $0 [command] [options]' )
    .option('key', {
        alias: ['k'],
        describe: 'path to an OpenSSH Ed25519 private key (default: ~/.ssh/id_ed25519)',
        type: 'string'
    })
    .middleware((argv) => {
        const keyPath = argv.key as string | undefined;
        if (keyPath) {
            SshKeyService.setKeyPath(keyPath);
        }
    }, true)

    .command( 'list', 'list all encrypted artifacts within the current directory', (yargs) => yargs.option( {
        format: optListingFormat
    } ), (argv) => new ListCommandHandler().argHandler(argv.format as string ) )

    .command(['test', 'check'], 'check that all notes can be decrypted with the local SSH key', (yargs) => yargs.option(  {
        fails: {
            alias: ['f', 'fail'],
            describe: 'only list fails',
            type: 'boolean',
            default: false
        }
    } ), (argv) => new TestCommandHandler().argHandler( argv.fails as boolean ) )

    .command('decrypt', 'decrypt notes to plain text using the local SSH key and an output directory',  (yargs) => yargs.option(  {
        outdir: {
            alias: ['o', 'out', 'to'],
            describe: 'output directory',
            type: 'string',
            demandOption: true
        },
        dryrun: {
            alias: ['dr', 'dry'],
            describe: 'dry run',
            type: 'boolean',
            default: false
        }
    } ), (argv) => new DecryptCommandHandler().argHandler( argv.outdir as string, argv.dryrun !== false ) )

    .demandCommand()
    .help()
    .wrap( null )
    .example([
        ['$0 list', 'Processes all *.md and *.mdenc files and list any encrypted artifacts within the current directory'],
        ['$0 test', 'check that all notes can be decrypted with the local SSH key'],
        ['$0 decrypt --outdir \\path\\to\\output\\', 'decrypt notes to an output directory'],
      ])
    .parse()
;

