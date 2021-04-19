import { Client } from '@pepperi-addons/debug-server/dist';
import { DataIndexTypeInsert } from './dataIndexTypeInsert';
import { TransacionLinesHelper } from './transactionLinesHelper.ts/transactionLinesHelper';

export class TransactionLinesInsert extends DataIndexTypeInsert{

tlHelper:TransacionLinesHelper;

    constructor(inClient: Client,inDataIndexType: string, inPnsObject : any){
        super(inClient,inDataIndexType,inPnsObject);
        this.tlHelper = new TransacionLinesHelper(this.papiClient);
    }

    public getRowsToUploadFromApiResult(fieldsToExport: string[], apiResult: any) {
        return this.tlHelper.getRowsToUploadFromApiResult(fieldsToExport,apiResult);
            
    }

    public async getDataFromApi(UUIDs: string[], fields: string[], apiResuorce : string) {

        return this.tlHelper.getDataFromApi(UUIDs,fields,apiResuorce);

    }
}