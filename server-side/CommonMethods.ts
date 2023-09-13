import { PapiClient } from '@pepperi-addons/papi-sdk'
import { Client} from '@pepperi-addons/debug-server'
import MyService from './my.service';
export  class CommonMethods{

    public static getPapiClient(client: Client) {
            return new PapiClient({
                baseURL:client.BaseURL,
                token: client.OAuthAccessToken,
                addonUUID: client.AddonUUID,
                addonSecretKey: client.AddonSecretKey
            });
        }

    public static distinct(value, index, self) {
            return self.indexOf(value) === index;
    }

    public static collectFieldsToSubscribeToOnTheApiResource(fieldsData: any) {
        var fieldsToSubscribe: string[] = [];
        for (var prefix in fieldsData) {
            var fieldsObjects = fieldsData[prefix];
            var fields: string[] = fieldsObjects.map(a => a.FieldName);

            if (fieldsToSubscribe.length > 0) {
                fieldsToSubscribe = fieldsToSubscribe.concat(fields);
            }
            else 
            {
                fieldsToSubscribe = fields;
            }
        }
        fieldsToSubscribe = fieldsToSubscribe.filter(CommonMethods.distinct);
            
        return fieldsToSubscribe;
    }

    //{refPrefix}.InternalID fields was added because of DI-25191
    public static addDefaultFieldsByType(fieldsToExport: string[],dataIndexType:string ) {
        switch (dataIndexType) {
            case "all_activities":
                fieldsToExport.push("InternalID","UUID", "Type", "StatusName", "ActionDateTime", "Account.InternalID","Account.UUID","Account.ExternalID","Account.Name", "Agent.InternalID","Agent.Name");
                break;
            case "transaction_lines":
                fieldsToExport.push("InternalID","UUID","Item.InternalID","Item.ExternalID","Item.Name","Item.MainCategory", "Transaction.InternalID","Transaction.StatusName", "Transaction.ActionDateTime", "Transaction.Account.InternalID","Transaction.Account.UUID","Transaction.Account.ExternalID","Transaction.Account.Name","Transaction.Type","Transaction.Agent.InternalID","Transaction.Agent.Name");
                break;
        }
        return fieldsToExport;
    }


    public static getAPiResourcesByObjectTypeName(objectTypeName: string):string[] {

        var APiResources:string[] = [];

        switch (objectTypeName) {
            case "Transaction":
                APiResources= ["transactions"]
                break;
            case "Activity":
                APiResources= ["activities"]
                break;
            case "Account":
            case "AdditionalAccount":
            case "OriginAccount":
            case "Account.Parent":
                APiResources= ["accounts"]
                break;
            case "Item":
            case "Item.Parent":
                APiResources= ["items"]
                break;
            case "Creator":
            case "Agent":
                APiResources= ["users","contacts"] //users must be the first alwasys - when I get the fields for creator/agent I need only from users resource
                break;
            case "ContactPerson":
                APiResources= ["contacts"]
                break;
            case "Profile":
                APiResources= ["profiles"]
                break;
            case "Role":
                APiResources= ["roles"]
                break;
            case "Catalog":
                APiResources= ["catalogs"]
                break;
            default: // to support caces where the 
                APiResources = [objectTypeName.toLowerCase()]
                break;
        }
        return APiResources;
    }

    public static async getDataIndexTypeAdalRecord(papiClient: PapiClient,client: Client,dataIndexType:string) 
    {
        return await papiClient.addons.data.uuid(client.AddonUUID).table("data_index").key(dataIndexType).get();
    }

    public static async saveDataIndexTypeAdalRecord(papiClient: PapiClient,client: Client, typeAdalRecord :any) 
    {
        return await papiClient.addons.data.uuid(client.AddonUUID).table("data_index").upsert(typeAdalRecord);
    }

    public static async getDataIndexUIAdalRecord(papiClient: PapiClient,client: Client) 
    {
        return await papiClient.addons.data.uuid(client.AddonUUID).table("data_index_ui").key("meta_data").get();
    }

    public static async  saveDataIndexUIAdalRecord(papiClient: PapiClient,client: Client, uiAdalRecord :any) 
    {
        return await papiClient.addons.data.uuid(client.AddonUUID).table("data_index_ui").upsert(uiAdalRecord);
    }

    public static async getTypesFields(papiClient:PapiClient,resource:string) {
        if(resource == "all_activities")
        {
            var transactionsFields = await papiClient.metaData.type("transactions").fields.get();
            var activitiesFields = await papiClient.metaData.type("activities").fields.get();
            
            return transactionsFields.concat(activitiesFields);
        }
        else
        {
            return await papiClient.metaData.type(resource).fields.get();
        }
    }

    public  static async createIndex(papiClient: PapiClient, client: Client) {
        console.log(`Recreating papi data index`)

        const numberOfShardsFlag = await papiClient.metaData.flags.name('NumberOfShards').get();
        let numberOfShards = numberOfShardsFlag;
    
        // the flag doesnt exist, the API returns "false".so im putting the default of number of shards (1)
        if (numberOfShardsFlag === false) {
            numberOfShards = 1;
        }

        await createPapiIndexSchemaNoFields(papiClient, "all_activities", numberOfShards);
        await createPapiIndexSchemaNoFields(papiClient, "transaction_lines", numberOfShards);      
    }
}



async function createPapiIndexSchemaNoFields(papiClient: PapiClient, resourceName: string, numberOfShards: any) {
    let res = await papiClient.post("/addons/data/schemes", {
        Name: resourceName,
        Type: "shared_index",
        DataSourceData: {
            IndexName: "papi_data_index",
            NumberOfShards: numberOfShards
        }
    });
    console.log(`create ${resourceName} schema result: ${JSON.stringify(res)}`)
}
