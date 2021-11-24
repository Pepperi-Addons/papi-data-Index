import { Client, Request } from '@pepperi-addons/debug-server'
import { AddonData, ApiFieldObject, CodeJob, PapiClient } from '@pepperi-addons/papi-sdk';
import { CommonMethods } from './CommonMethods';
import { PNSSubscribeHelper } from './PNSSubscribeHelper';

const adalTableName = "data_index";


/***************              Get UI DATA           *****************/

export async function get_ui_data(client: Client, request: Request) {//get the saved fields and the progress indicator 

    var papiClient = CommonMethods.getPapiClient(client);

    var UI_adalRecord = await CommonMethods.getDataIndexUIAdalRecord(papiClient,client);

    var ui_saved_fields =  UI_adalRecord["Fields"];
    var ui_data = {
        Fields: await getFields(papiClient), //the fields for the dropdowns and the defaultFields - the format = > {TypesFields: {Transaction:[],Account:[], transaction_lines:[]....}, DataIndexTypeDefaultFields: {all_activities:[], transaction_lines:[]}},
        Saved_Fields : ui_saved_fields,
        ProgressData: {}
    }

    if(ui_saved_fields) // if not exist - it is probably the first time the get was called  
    {
        if(UI_adalRecord["RunTime"])
        {// if we have run time  - the progress indicator should be the time of the run (the code job should set it to null)
            ui_data.ProgressData["RunTime"] = UI_adalRecord["RunTime"];
        }
        else
        { // it is running now or already run - need to get the rebuild progress
            await getRebuildProgressData(papiClient, client, ui_data,UI_adalRecord);
        }
    }
    return ui_data;
}

async function getFields(papiClient: PapiClient) { // get the needed fields for the drop downs
    
    var types = ["Transaction","Activity","Account","transaction_lines","Item","Agent"]

    var typeToFields:any = { }

    for(var t in types){
        var objectType = types[t];
        var fieldsObjects :{key:string,value:string, uiType:any}[] = [];
        var resource = CommonMethods.getAPiResourcesByObjectTypeName(types[t])[0];

        var fields = await CommonMethods.getTypesFields(papiClient,resource);

        fields.forEach(fieldObj => {
            if (checkIfFieldIsValid(fieldObj,objectType))
            {
                fieldsObjects.push({key:fieldObj.FieldID, value:fieldObj.Label, uiType:fieldObj.UIType.Name}); // the key val is the format of the pwp-select data of the UI
            }
        });
        
        typeToFields[objectType] = fieldsObjects;
    }

    var typeToDefaultFields = {
        "all_activities": CommonMethods.addDefaultFieldsByType([],"all_activities"),
        "transaction_lines": CommonMethods.addDefaultFieldsByType([],"transaction_lines")
    }

    return { DataIndexTypeDefaultFields: typeToDefaultFields,
            TypesFields: typeToFields
        };

}

function checkIfFieldIsValid(field:ApiFieldObject,objectType:string)
{
    
    var valid = true;
    if(field.FieldID.startsWith("TSA"))
    {
        valid = field.UIType.ID != 48 && field.UIType.ID != 49; // not reference TSA and not buttomn TSA
    }
    else
    {
        valid = !isInIgnoreList(field.FieldID);
    }

    // reference fields doesnt come in meta data fields api call so no 'if' case on it
    return valid;

}

function isInIgnoreList(field:string):boolean{
    //calculated fields that are not supported
    var fieldsToIgnoe = 
        ['BillToAddress',
        'BillToCity',
        'BillToCountry',
        'BillToCountryIso',
        'BillToFax',
        'BillToName',
        'BillToPhone',
        'BillToState',
        'BillToStateIso',
        'BillToStreet',
        'BillToZipCode',
        'Branch',
        'ContactPersonList',
        'ContactPersonName',
        'CreatorExternalID',
        'Currency',
        'CurrencySymbol',
        'ShipToAddress',
        'ShipToCity',
        'ShipToCountry',
        'ShipToCountryIso',
        'ShipToExternalID',
        'ShipToFax',
        'ShipToName',
        'ShipToPhone',
        'ShipToState',
        'ShipToStateIso',
        'ShipToStreet',
        'ShipToZipCode',
        'Signature',
        'TotalsBox',
        'Type', // problematic field - changing ATD name will cause massive update in elastic and also e have problem to get update in it on PNS
        'ModificationDateTime',
        'AccountExternalID',
        'ItemExternalID',
        'ColorImage',
        'Image',
        'ItemInStockQuantity',
        'LastOrderItemDate',
        'LastOrderItemPrice',
        'LastOrderItemQuantity',
        'ParentImage',
        'SetName',
        'SpecialOfferLeadingOrderPortfolioItemUUID',
        'UOM',
        'Archive'
    ]

    return fieldsToIgnoe.includes(field);
}


async function getRebuildProgressData(papiClient: PapiClient, client: Client, ui_data: any, UI_adalRecord:any) 
{
    var allActivitiesPolling = {};
    var transactionLinesPolling = {};

    var transactionLinesProgress = {
        Status: "",
        Precentag: 0
    };

    if(UI_adalRecord["FullPublish"] == true)
    {
        var fullPollingRes = await papiClient.addons.api.uuid(client.AddonUUID).file("data_index").func("full_index_rebuild_polling").post();
        allActivitiesPolling = fullPollingRes["all_activities"]; 
        transactionLinesPolling = fullPollingRes["transaction_lines"];
    }
    else
    {
        allActivitiesPolling = await await papiClient.addons.api.sync().uuid(client.AddonUUID).file("data_index").func("all_activities_polling").post(); 
        transactionLinesPolling = await papiClient.addons.api.sync().uuid(client.AddonUUID).file("data_index").func("transaction_lines_polling").post();
    }

    var allActivitieProgress = {
        Status: allActivitiesPolling["Status"],
        Precentag:  Math.round((parseInt(allActivitiesPolling["Current"]) / parseInt(allActivitiesPolling["Count"])) * 100)
    };
    
    if (allActivitiesPolling["Status"] == "Success") 
    {
        transactionLinesProgress = {
            Status: transactionLinesPolling["Status"],
            Precentag:  Math.round((parseInt(transactionLinesPolling["Current"]) / parseInt(transactionLinesPolling["Count"])) * 100)
       };

        ui_data.ProgressData["Status"] = transactionLinesPolling["Status"] != "" ? transactionLinesPolling["Status"] : "InProgress"; //general status for both types together
        ui_data.ProgressData["Message"] = transactionLinesPolling["Message"] != null ? `transaction_lines rebuild message: ${transactionLinesPolling["Message"]}` : "";
    }
    else 
    { 
        ui_data.ProgressData["Status"] = allActivitiesPolling["Status"]; //general status for both types together
        ui_data.ProgressData["Message"] = allActivitiesPolling["Message"] != null ? `all_activities rebuild message: ${allActivitiesPolling["Message"]}` : "";
    }

    ui_data.ProgressData["all_activities_progress"] = allActivitieProgress;
    ui_data.ProgressData["transaction_lines_progress"] = transactionLinesProgress;
}

/***************************************************************************/


/***************             Delete all Index             *****************/

export async function delete_index(client: Client, request: Request) {

    var papiClient = CommonMethods.getPapiClient(client);

    var result:any={};
    result.success=true;
    result.resultObject={};

    var res = await papiClient.post("/bulk/data_index/rebuild/install");//init papi adal record 

    await initRebuildDataADALRecord(papiClient, client,"all_activities");
    await initRebuildDataADALRecord(papiClient, client,"transaction_lines");

    return await papiClient.post(`/elasticsearch/clear/data_index`);
}

async function initRebuildDataADALRecord(papiClient: PapiClient, client: Client, dataIndexType:string) {

    var adalRecord = await CommonMethods.getDataIndexTypeAdalRecord(papiClient,client,dataIndexType);

    var rebuildData = adalRecord["RebuildData"];

    if (rebuildData) 
    {
        rebuildData["FieldsToExport"] = [];
        rebuildData["Status"] = "";
        rebuildData["Count"] = NaN;
        rebuildData["Current"] = NaN;
        rebuildData["LastInternalID"] = 0;
        adalRecord["RebuildData"] = rebuildData;

        var res = await CommonMethods.saveDataIndexTypeAdalRecord(papiClient,client,adalRecord);
        console.log(`Init rebuild data in adal recored for data index type ${dataIndexType} results: ${JSON.stringify(res)}`)
    }
}


/****************************************************************************/


/***************                    Publish                 *****************/


export async function publish(client: Client, request: Request) {
    var papiClient = CommonMethods.getPapiClient(client);

    var result:any={};
    result.success=true;
    result.resultObject={};

    var UI_adalRecord = await save_ui_data(client,request);

    if(UI_adalRecord["RunTime"]) // create job to run
    {
        await setPublishCodeJob(UI_adalRecord, papiClient, client);

    }
    else // run now
    {
        var codeJobUUID = UI_adalRecord["PublishCodeJobUUID"];
        if(codeJobUUID) // unscheduled the code job for just in case so it will not run twice - in case that the user chose  first run at and then presse run now.
        {
            var codeJob = await papiClient.codeJobs.upsert({
                UUID: codeJobUUID,
                CodeJobName: "DataIndex publish job",
                IsScheduled: false
            });
        }
        
        result.resultObject = await papiClient.addons.api.uuid(client.AddonUUID).async().file("data_index_ui_api").func("publish_job").post()
    }

    return result;
}

async function setPublishCodeJob(UI_adalRecord: AddonData, papiClient: PapiClient, client: Client) {
    let date: Date = new Date(UI_adalRecord["RunTime"]);

    var cronExpression = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;

    var codeJobUUID = UI_adalRecord["PublishCodeJobUUID"];
    var codeJob;

    if (codeJobUUID) 
    {
        codeJob = await papiClient.codeJobs.get(codeJobUUID);
    }
    console.log(`Index rebuild - setting the publish job to run with cron  ${cronExpression}`);

    if (codeJob) {
        codeJob = {
            UUID: codeJobUUID,
            CodeJobName: "DataIndex publish job",
            IsScheduled: true,
            CodeJobIsHidden: false,
            CronExpression: cronExpression
        };
    }
    else //new code JOB
    {
        codeJob = {
            Type: "AddonJob",
            CodeJobName: "DataIndex publish job",
            IsScheduled: true,
            CronExpression: cronExpression,
            AddonPath: "data_index_ui_api.js",
            AddonUUID: client.AddonUUID,
            FunctionName: "publish_job"
        };
    }

    codeJob = await papiClient.codeJobs.upsert(codeJob);

    UI_adalRecord["PublishCodeJobUUID"] = codeJob["UUID"];
    await CommonMethods.saveDataIndexUIAdalRecord(papiClient, client, UI_adalRecord);

    console.log(`Index rebuild -  publish job was set to run at ${date}, codeJOB UUID = ${codeJob["UUID"]}`);
}

export async function publish_job(client: Client, request: Request) {
    var papiClient = CommonMethods.getPapiClient(client);
    var result:any={};
    result.success=true;
    result.resultObject={};

    try
    {
        var adal_ui_data = await CommonMethods.getDataIndexUIAdalRecord(papiClient,client);
        var al_needRebuild = await checkIfDataIndexNeedRebuild(papiClient, client, "all_activities",adal_ui_data["Fields"]["all_activities"].map(f=>f.FieldID),result.resultObject);
        var tl_needRebuild = await checkIfDataIndexNeedRebuild(papiClient, client, "transaction_lines",adal_ui_data["Fields"]["transaction_lines"].map(f=>f.FieldID) ,result.resultObject);

        // need to start a rebuild according to the cases
        adal_ui_data["FullPublish"] = false; // for the polling using the UI - we need to know what polling to call

        if(al_needRebuild && tl_needRebuild) // both need rebuild - run full_index_rebuild
        {
            console.log(`Publish job - running full index rebuild`);
            result.resultObject = await papiClient.addons.api.uuid(client.AddonUUID).async().file("data_index").func("full_index_rebuild").post()
            adal_ui_data["FullPublish"] = true;
        }
        else if(al_needRebuild) // only all_activities need rebuild
        {
            console.log(`Publish job - only all_activities rebuild`);
            result.resultObject = await papiClient.addons.api.uuid(client.AddonUUID).async().file("data_index").func("all_activities_rebuild").post()
        }
        else if(tl_needRebuild) // only transaction_lines need rebuild
        {
            console.log(`Publish job - only transaction_lines rebuild`);
            result.resultObject = await papiClient.addons.api.uuid(client.AddonUUID).async().file("data_index").func("transaction_lines_rebuild").post()
        }

        adal_ui_data["RunTime"] = null;

        CommonMethods.saveDataIndexUIAdalRecord(papiClient,client,adal_ui_data);

        if(client["CodeJobUUID"]) // run in a codeJob
        {//unscheduled the code job

            console.log(`Publish job - setting the job to isScheduled=false`);
            papiClient.codeJobs.upsert({IsScheduled:false, UUID:client["CodeJobUUID"],CodeJobName:"DataIndex publish job"});

        }

    }        
    catch(e)
    {
        result.success = false;
        result.erroeMessage = e.message;
    }


    
    return result;
}

async function checkIfDataIndexNeedRebuild(papiClient: PapiClient, client: Client, dataIndexType: string,uiFields:string[], result: any) 
{
    var di_AdalRecord = await CommonMethods.getDataIndexTypeAdalRecord(papiClient,client,dataIndexType);
    var rebuildData =  di_AdalRecord["RebuildData"];
    if(rebuildData)
    {
        if(rebuildData["Status"] == "Failure")
            return true;
        
        var exportedFields: string[] = rebuildData["FieldsToExport"];

        for (var i = 0; i < uiFields.length; i++) 
        {// if at lease one field from the fields that was saved in the UI is new - this data index type need a rebuild - no need to check the rest
            if (!exportedFields.includes(uiFields[i])) 
            {
                return true;
            }
        }
        var body:any = {DataIndexType:dataIndexType};
      
        // no new fields - no need a rebuild - check if fields was removed - and if so update the subscriprion and the fields in all places;
        var res = await papiClient.addons.api.uuid(client.AddonUUID).async().file("data_index_ui_api").func("handle_remove_fields").post(undefined,body)
    
        result[dataIndexType] = res;
        return false;
    }

    return true;
}

export async function save_ui_data(client: Client, request: Request) { //save the fields and the run time (if given) of the rebuild
    var papiClient = CommonMethods.getPapiClient(client);

    var uiData =  request.body;
    var ui_fields = uiData["Fields"];
    var ui_adalRecord = await CommonMethods.getDataIndexUIAdalRecord(papiClient,client);

    ui_adalRecord["Fields"]= {
        "all_activities": [...new Map(ui_fields["all_activities"].map(item => [item["FieldID"], item])).values()],
        "transaction_lines": [...new Map(ui_fields["transaction_lines"].map(item => [item["FieldID"], item])).values()]
    }
    ui_adalRecord["RunTime"] = null;

    if(ui_adalRecord["FullPublish"] == undefined){
        ui_adalRecord["FullPublish"]  = false;
    }

    if (uiData["RunTime"]) { // if not set or null - means run now

        console.log(`save_ui_data - now date is: ${new Date()}, runTime is: ${uiData["RunTime"]}`);

        ui_adalRecord["RunTime"] = uiData["RunTime"];
    }

    return await CommonMethods.saveDataIndexUIAdalRecord(papiClient,client, ui_adalRecord) ;
}

export async function handle_remove_fields(client: Client, request: Request) {
    var body = request.body;
    var dataIndexType = body["DataIndexType"] 
    return checkAndHandleRemoveOfFieldsCase(client, dataIndexType);
}

async function checkAndHandleRemoveOfFieldsCase(client: Client, dataIndexType: string): Promise<void> 
{
    var papiClient = CommonMethods.getPapiClient(client);
    var UI_AdalRecord = await CommonMethods.getDataIndexUIAdalRecord(papiClient,client);
    var uiFields = UI_AdalRecord[`${dataIndexType}_fields`] ? UI_AdalRecord[`${dataIndexType}_fields`] : [];
    
    var adalRecord = await await CommonMethods.getDataIndexTypeAdalRecord(papiClient,client,dataIndexType)

    var exportedFields :string[] = adalRecord["RebuildData"] ? adalRecord["RebuildData"]["FieldsToExport"] : [];
    
    var newExportedFields = Object.assign([], exportedFields); // clone the exported fields
    for (var j = 0; j < exportedFields.length; j++) 
    {
        var field = exportedFields[j];
        if (!uiFields.includes(field)) 
        {
            var index = newExportedFields.indexOf(field, 0);
            if (index > -1 && checkIfFieldCanBeRemoved(field)) 
            {
                newExportedFields.splice(index, 1); // remove from the clone exported fields the fields that was removed
            }
        }
    }

    if (newExportedFields.length < exportedFields.length) // fields was removed - need to update the exported fields and the subscription
    {
        adalRecord["RebuildData"]["FieldsToExport"] = newExportedFields;

        await await CommonMethods.saveDataIndexTypeAdalRecord(papiClient,client,adalRecord);

        const pnsHelper = new PNSSubscribeHelper(client, dataIndexType);
        await pnsHelper.handleUnsubscribeAndSubscribeToPNS(adalRecord, uiFields);
    }
}

function checkIfFieldCanBeRemoved(field: string){

    // fields that ends with '.InternalID' are probably fields that the exporter added to suport reference fields, we cant remove it because we dont jave a way to know in that point if it was field chosen by the user or added by the exporter
    return !field.endsWith(".InternalID") && field != 'InternalID' && field != "UUID";
}


/*********************************************************************************/









