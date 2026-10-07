import { CryptoHelperFactory } from "./CryptoHelperFactory.ts";

export class FileData {

	public version = '2.12.3.1';
	/** Legacy field kept so older JSON files still parse; always empty now. */
	public hint?: string;
	public encodedData:string;

	constructor( version:string, encodedData:string ){
		this.version = version;
		this.encodedData = encodedData;
	}
}

export class FileDataHelper{

	public static DEFAULT_VERSION = '2.12.3.1';

	public static async encrypt( text:string ) : Promise<FileData>{
		const crypto = CryptoHelperFactory.BuildDefault();
		const encryptedData = await crypto.encryptToBase64(text);
		return new FileData( FileDataHelper.DEFAULT_VERSION, encryptedData);
	}

	public static async decrypt( data: FileData ) : Promise<string|null>{
		if ( data.encodedData == '' ){
			return '';
		}
		const crypto = CryptoHelperFactory.BuildFromFileDataOrThrow( data );
		return await crypto.decryptFromBase64( data.encodedData );
	}
}

export class JsonFileEncoding {

	public static encode( data: FileData ) : string{
		//console.debug( 'JsonFileEncoding.encode', {data} );
		return JSON.stringify(data, null, 2);
	}

	public static isEncoded( text: string ) : boolean {
		try {
			JSON.parse( text );
			return true;
		} catch ( error ) {
			return false;
		}
	}

	public static decode( encodedText:string ) : FileData {
		//console.debug('JsonFileEncoding.decode',{encodedText});
		if ( encodedText === '' ){
			return new FileData( FileDataHelper.DEFAULT_VERSION, '' );
		}
		return JSON.parse( encodedText ) as FileData;
	}
}
