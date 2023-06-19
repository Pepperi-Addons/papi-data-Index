import { Client } from '@pepperi-addons/debug-server/dist';
import { DataIndexTypeUpdate } from './dataIndexTypeUpdate';
import { TransacionLinesHelper } from './transactionLinesHelper.ts/transactionLinesHelper';

export class TransactionLinesUpdate extends DataIndexTypeUpdate{

    tlHelper:TransacionLinesHelper;

    constructor(inClient: Client,inDataIndexType: string, inPnsObject : any){
        super(inClient,inDataIndexType,inPnsObject);
        this.tlHelper = new TransacionLinesHelper(this.papiClient);
    }

    public getRowsToUploadFromApiResult(fieldsToExport: string[], apiResult: any) {
        return this.tlHelper.getRowsToUploadFromApiResult(fieldsToExport,apiResult);
    
    }

    // public async getDataFromApi(UUIDs: string[], fields: string[], apiResuorce : string) {
    // 
    //return await this.tlHelper.getDataFromApi(UUIDs,fields,apiResuorce);
    // 
    //}

    protected getAdditionalFieldsForSearch(): string {
        return this.tlHelper.getAdditionalFieldsForSearch();
    }
}