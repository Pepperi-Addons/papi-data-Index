import { Client } from "@pepperi-addons/debug-server/dist";
import { AddonData, CodeJob, PapiClient } from "@pepperi-addons/papi-sdk";
import { CommonMethods } from "./CommonMethods";
import { PNSSubscribeHelper } from "./PNSSubscribeHelper"


export  class DataIndexActions{

    client: Client;
    papiClient: PapiClient;
    dataIndexType: string;
    tsaRefToApiResource: any;
    private adalTableName = "data_index";

    constructor(inClient: Client,inDataIndexType: string) {
        this.client = inClient;
        this.papiClient = CommonMethods.getPapiClient(this.client);
        this.dataIndexType = inDataIndexType;
    }


    public async rebuild(): Promise<any> {
    
        var resultObject: {[k: string]: any} = {};
        resultObject.success=true;
        resultObject.resultObject={};
    
        var fieldsToExport : string[];
        var pnsHelper = new PNSSubscribeHelper(this.client,this.dataIndexType);

        var adalRecord = await CommonMethods.getDataIndexTypeAdalRecord(this.papiClient,this.client,this.dataIndexType);

        try
        {
            var UIAdalRecord = await CommonMethods.getDataIndexUIAdalRecord(this.papiClient,this.client);
    
            fieldsToExport = UIAdalRecord[`${this.dataIndexType}_fields`]? UIAdalRecord[`${this.dataIndexType}_fields`] : [];
            console.log(`Start ${this.dataIndexType} rebuild function`);
    
            //Add defaultFields to fieldToExport
            fieldsToExport = CommonMethods.addDefaultFieldsByType(fieldsToExport,this.dataIndexType);
    
            fieldsToExport = fieldsToExport.filter(CommonMethods.distinct)
    
            //Unsubscribe old subscription and subscribe to new fields changes
            await pnsHelper.handleUnsubscribeAndSubscribeToPNS(adalRecord, fieldsToExport);
    
            //Run papi_rebuild
            var rebuildObject = await this.papiClient.post(`/bulk/data_index/rebuild/${this.dataIndexType}`,{FieldsToExport:fieldsToExport});
    
            //Save the rebuild object that is returns from the above run in data_index DADL
            adalRecord["RebuildData"] = rebuildObject;
    
            //Create a code Job that calles the polling function that run every 5 minutes
            var codeJob = await this.createRebuildPollingCodeJob(adalRecord);
    
            adalRecord["PollingCodeJobUUID"] = codeJob["UUID"];
    
            //save the ADAL record with the RebuildData and PollingCodeJobUUID
            await CommonMethods.saveDataIndexTypeAdalRecord(this.papiClient,this.client,adalRecord);
    
            resultObject.resultObject = rebuildObject;
        }
        catch(e)
        {
            resultObject.success = false;
            resultObject.erroeMessage = e.message;

            adalRecord["RebuildData"]["Status"] = 'Failure';
            adalRecord["RebuildData"]["Message"] = e.message;
            await CommonMethods.saveDataIndexTypeAdalRecord(this.papiClient,this.client,adalRecord);

        }
        
        return resultObject
    }

    async handleRebuildStatus(adalRecord:any)
    {
        var status = adalRecord["RebuildData"]["Status"];
        if(status == "Success" || status == "Failure")
        {
            await this.unscheduledPollingCodeJob(adalRecord);
        }
        console.log(`Data Index ${this.dataIndexType} rebuild ended with status ${status}`)
    }

    async getPollingResults(rebuildData:any) : Promise<any>
    {
        return rebuildData;
    }

    public async polling(): Promise<any> {
    
        var resultObject: {[k: string]: any} = {};
        resultObject = {};
        try
        {
            //Run papi_rebuild_Poling
            var rebuildData = await this.papiClient.post(`/bulk/data_index/rebuild/polling/${this.dataIndexType}`);
    
            //update the rebuildDataObject in the data_index ADAL record
            var adalRecord = await this.saveTheRebuildDataObjectInADAL(rebuildData);
    
            //Check the status
            await this.handleRebuildStatus(adalRecord);


            resultObject = await this.getPollingResults(adalRecord["RebuildData"]);
            
        }
        catch(e)
        {
            resultObject.erroeMessage = e.message;
        }

        return resultObject
    }

    protected async unscheduledPollingCodeJob(adalRecord: AddonData) {
        var codeJobUUID = this.client["CodeJobUUID"] ? this.client["CodeJobUUID"] : adalRecord["PollingCodeJobUUID"];

        if (codeJobUUID) { //unscheduld the codeJob
            var codeJob = await this.papiClient.codeJobs.upsert({ UUID: codeJobUUID, IsScheduled: false, CodeJobName: `${this.dataIndexType} rebuild polling code job` });
            console.log(`Setting code job ${codeJobUUID} with IsScheduled: false results: ${JSON.stringify(codeJob)}`)

        }
    }

    public async retry(): Promise<any> 
    {
    
        var resultObject: {[k: string]: any} = {};
        resultObject.success=true;
        resultObject.resultObject={};
        try
        {
            var adalRecord = await CommonMethods.getDataIndexTypeAdalRecord(this.papiClient,this.client,this.dataIndexType);
    
            //Run papi_rebuild_retry
            var rebuildObject = await this.papiClient.post(`/bulk/data_index/rebuild/retry/${this.dataIndexType}`);
    
            var codeJobUUID = adalRecord["PollingCodeJobUUID"];
    
            if(codeJobUUID)
            {//scheduld the codeJob
                await this.papiClient.codeJobs.upsert({UUID:codeJobUUID ,IsScheduled:true, CodeJobName:`${this.dataIndexType} rebuild polling code job`});
            }
            resultObject.resultObject = rebuildObject;
            
        }
        catch(e)
        {
            resultObject.success = false;
            resultObject.erroeMessage = e.message;
        }
    
        return resultObject
    }
    
    
    async saveTheRebuildDataObjectInADAL(rebuildObject: Promise<any>, adalRecord? :AddonData) {
        if(!adalRecord){
            adalRecord = await CommonMethods.getDataIndexTypeAdalRecord(this.papiClient,this.client,this.dataIndexType);
        }
        
        if(!adalRecord["RebuildData"] || // if no rebuild data or the rebuild data is not up to date - update it
            (new Date(adalRecord["RebuildData"]["ModificationDateTime"]) < new Date(rebuildObject["ModificationDateTime"])))
            {
                adalRecord["RebuildData"] = rebuildObject;
                adalRecord =  await  CommonMethods.saveDataIndexTypeAdalRecord(this.papiClient,this.client,adalRecord);
            }
        
        return adalRecord;
    }
    
    private async createRebuildPollingCodeJob(adalRecord:any) {
        var codeJobUUID = adalRecord["PollingCodeJobUUID"];
        var codeJobName = `${this.dataIndexType} rebuild polling code job`;
        var codeJob;
    
        if (codeJobUUID) { 
            // get existing codeJob
            codeJob = await this.papiClient.codeJobs.uuid(codeJobUUID).find();
        }
        var functionName = this.getPollingFunctionName();

        if (codeJob && codeJob["UUID"]) 
        {//reschedule existing code job
            codeJob = await this.papiClient.codeJobs.upsert({UUID:codeJobUUID,FunctionName:functionName ,IsScheduled:true, CodeJobName:codeJobName});
            console.log(`Reschedule ${codeJobName} with function '${functionName}' result: ${JSON.stringify(codeJob)}`)
        }
        else 
        { //create new polling code job
            codeJob = {
                Type: "AddonJob",
                CodeJobName: codeJobName,
                IsScheduled: true,
                CronExpression: "*/5 * * * *",
                AddonPath: "data_index.js",
                AddonUUID: this.client.AddonUUID,
                FunctionName: functionName
            };
            codeJob = await this.papiClient.codeJobs.upsert(codeJob);

            console.log(`Create new code job ${codeJobName} with function '${functionName}' result: ${JSON.stringify(codeJob)}`)

        }
        
        return codeJob;
    }

    getPollingFunctionName()
    {
        return `${this.dataIndexType}_polling`;
    }


}
