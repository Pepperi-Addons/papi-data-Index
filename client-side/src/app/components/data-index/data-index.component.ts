import {
    Component,
    EventEmitter,
    Input,
    Output,
    OnInit,
    ViewEncapsulation,
    Compiler,
    ViewChild,
    OnDestroy,
    AfterViewInit,
    ViewContainerRef,
    TemplateRef,
} from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import { Router, ActivatedRoute } from "@angular/router";
import { PepLayoutService, PepLoaderService, PepScreenSizeType } from '@pepperi-addons/ngx-lib';
import { DataIndexService } from './data-index.service';
import { identifierModuleUrl } from "@angular/compiler";

import { PublishDialogComponent } from '../dialogs/publish-dialog.component';

import { of } from "rxjs";
import { FormArray, FormBuilder, FormGroup } from "@angular/forms";


@Component({
  selector: 'data-index',
  templateUrl: './data-index.component.html',
  styleUrls: ['./data-index.component.scss'],
  providers: [DataIndexService]
})
export class DataIndexComponent implements OnInit {
    dataReady:boolean = false;
    screenSize: PepScreenSizeType;
    defaultFields: any;
    typesFields: any;
    uiData:any;
    rebuildInProgress:boolean;
    progressIndicator:string;
    indexingFaild:boolean = false;
    indexingError:string;

    all_activities_types = []
    transaction_lines_types = []


    all_activities_apiNames = {}
    transaction_lines_apiNames = {}

    menuOptions = []

    fields = {
        "all_activities":[],
        "transaction_lines":[]
    }

    fieldsNumberLimit = 30;

    intervalCounter = 0;// it is for delay on updating the progress by the async publish, need to wait a vit more then 10 sec
    fieldIDtoType: any;


    constructor(
        public dataIndexService: DataIndexService,
        private translate: TranslateService,
        public routeParams: ActivatedRoute,
        public router: Router,
        public compiler: Compiler,
        public layoutService: PepLayoutService,
        public loaderService: PepLoaderService
        )

     {

        // Parameters sent from url
        this.dataIndexService.pluginUUID = this.routeParams.snapshot.params['addon_uuid'];
        let userLang = "en";
        translate.setDefaultLang(userLang);
        userLang = translate.getBrowserLang().split("-")[0]; // use navigator lang if available
        translate.use(userLang);
        this.layoutService.onResize$.subscribe(size => {
            this.screenSize = size;
        });

    }

  ngOnInit(): void {

    this.getUIData();

  }

    private getUIData() {

       this.dataIndexService.getUIData((uiData: any) => {

            this.uiData = uiData;

            var fields = uiData['Fields']; // //the fields for the dropdowns and the defaultFields
            this.defaultFields = fields['DataIndexTypeDefaultFields'];
            this.typesFields = fields['TypesFields'];
            this.fieldIDtoType = fields['FieldIDtoType']

            var progressStatus = uiData['ProgressData']['Status'];

            this.rebuildInProgress = progressStatus == 'InProgress';

            this.setProgressIndicator(uiData['ProgressData']);

            this.menuOptions = [{ key: 'delete_index', text: this.translate.instant('Data_index_delete_index') ,disabled:this.rebuildInProgress}];

            this.SetTransactionLinesUIData();

            this.SetAllActivitiesTabData();

            this.dataReady = true;

            if(this.progressIndicator != "" && !this.indexingFaild)
                this.setInterval();

        },
        (error)=>{
            this.dataIndexService.openDialog(
                "ERROR",
                error
            );
        });

    }

    private setInterval() {
        this.intervalCounter=0;
        var intervalId = setInterval(() => {
            this.refreshProgressIndicator(intervalId);
        }, 10000); // 10 secs is the minimum best time to refresh
    }

    private SetTransactionLinesUIData() {
        this.transaction_lines_types = [
            { key: "transaction_lines", value: this.translate.instant("Data_index_object_type_Transaction_line") },
            { key: "Item", value: this.translate.instant("Data_index_object_type_Item") },
            { key: "Transaction", value: this.translate.instant("Data_index_object_type_Transaction") },
            { key: "Transaction.Account", value: this.translate.instant("Data_index_object_type_Account") },
            { key: "Transaction.Agent", value: this.translate.instant("Data_index_object_type_Agent") }

        ];

        this.transaction_lines_apiNames["transaction_lines"]= this.typesFields["transaction_lines"];
        this.transaction_lines_apiNames["Item"] = this.typesFields["Item"];
        this.transaction_lines_apiNames["Transaction"] = this.transaction_lines_apiNames["Transaction"] ? this.transaction_lines_apiNames["Transaction"] : [];
        this.transaction_lines_apiNames["Transaction.Account"] = this.typesFields["Account"];
        this.transaction_lines_apiNames["Transaction.Agent"] = this.typesFields["Agent"];

        this.setTabFields("transaction_lines");
    }

    private SetAllActivitiesTabData() {
        this.all_activities_types = [
            { key: "all_activities", value: this.translate.instant("Data_index_object_type_all_activities") },
            { key: "Account", value: this.translate.instant("Data_index_object_type_Account") },
            { key: "Agent", value: this.translate.instant("Data_index_object_type_Agent") }

        ];

        var transaction_activities_fields = this.typesFields["Transaction"].concat(this.typesFields["Activity"]);
        this.all_activities_apiNames = {
            "all_activities": this.getDistinctFieldsObj(transaction_activities_fields),
            "Account": this.typesFields["Account"] ,
            "Agent": this.typesFields["Agent"]
        };

        this.setTabFields("all_activities");
    }

    private setTabFields(indexType: string) {
        this.defaultFields[indexType].forEach(field => {
            this.addFieldToTabUIFields(field, indexType, true);
        });

        this.uiData[`${indexType}_saved_fields`].forEach(field => {
            if (!this.defaultFields[indexType].includes(field)) { // default fields will be added separetley to the UI arr
                this.addFieldToTabUIFields(field, indexType, false);
            }
        });
    }

    private addFieldToTabUIFields(field: string, indexType: string, defaultField: boolean) {
        if (field.includes(".")) { // ref field
            var lastDotIndex = field.lastIndexOf('.');
            var prefix = field.substring(0, lastDotIndex);
            var objectType = prefix;

            if(prefix.includes(".")){// e.g Transaction.Agent
                objectType = prefix.substring(prefix.lastIndexOf('.')+1) // take the Agent
            }

            var apiName = field.substring(lastDotIndex + 1);
            if (this.typesFields[objectType]) //if not defined - the prefix is not supported in the ui
            {
                var fieldObj =  this.getFieldFromFieldsType(objectType, apiName);
                if (fieldObj) // can be not defined if invalid api name somehow was entered to adal record -will not be shown and new publish will remove it
                {
                    this.fields[indexType].push({ type: prefix, apiName: apiName, default: defaultField });
                }
            }
        }
        else {
            var fieldObj =  this.getFieldFromFieldsType(indexType, field);

            if (fieldObj) // can be not defined or enpty array if invalid api name somehow was entered to adal record -will not be shown and new publish will remove it
            {
                this.fields[indexType].push({ type: indexType, apiName: field, default: defaultField });
                this.handleSpecialCases(indexType, fieldObj);

            }

        }
    }

    private handleSpecialCases(indexType:string, fieldObj: any) {
        if (indexType == "all_activities") {                 // need to put the saved fields of transaction in the apiNames  options on transaction_lines tab
            if(!this.transaction_lines_apiNames["Transaction"])
                this.transaction_lines_apiNames["Transaction"] = [];
            this.transaction_lines_apiNames["Transaction"].push(fieldObj);
        }
    }

    private getFieldFromFieldsType(type: string, apiName: string) {
        var res;
        if(type == "all_activities"){
             res = this.getFieldObj("Transaction", apiName);
             if(!res || res.length == 0)
                res = this.getFieldObj("Activity", apiName);
        }
        else
        {
            res = this.typesFields[type].filter(field => {
                return field.key === apiName;
            });
        }
        return res && res.length > 0? res[0]:undefined;
    }

    private getFieldObj(type: string, apiName: string){
        return this.typesFields[type].filter(field => {
            return field.key === apiName;
        });
    }

    private setProgressIndicator(progressData: any) {
        var progressStatus = progressData["Status"];

        if (progressData["RunTime"]) {
            let date = new Date (progressData["RunTime"]);
            var h = date.getHours();
            var m = date.getMinutes();
            this.progressIndicator = `${this.translate.instant('Data_index_publishJob_scheduled_to')} ${h < 10 ? '0'+ h : h}:${m < 10 ? '0'+ m : m}`;
        }
        else if (progressStatus) {

            if (progressStatus == "Failure")
            {
                this.progressIndicator = this.translate.instant('Data_index_failedToPublish');
                this.indexingFaild = true;
                this.indexingError = progressData["Message"];
            }
            else
            {
                var alProgressData = progressData["all_activities_progress"];
                if(alProgressData["Status"] == "" || alProgressData["Status"] == "InProgress") //DI-18047 -  When exporting the Activities/Transactions, then the progress will show only the Transaction percentage. (it will not show '0% of Lines')
                {
                    var alPrecentage = progressData["all_activities_progress"]["Precentag"];
                    alPrecentage = alPrecentage != "" && alPrecentage != null? alPrecentage : 0;
                    this.progressIndicator =  `${ this.translate.instant('Data_index_processing_all_activities')} (${alPrecentage}% ${this.translate.instant('Data_index_completed')})`;
                }
                else if(alProgressData["Status"] == "Success") //DI-18047 -  When the Activities/Transactions export is done and the Lines are exported, then the progress will show only the Lines percentage. (it will not show '100% of Transactions')
                {
                    var tlProgressData = progressData["transaction_lines_progress"];
                    alPrecentage = alPrecentage != "" && alPrecentage != null? alPrecentage : 0;

                    if(tlProgressData["Status"] == "" || tlProgressData["Status"] == "InProgress")
                    {
                        var tlPrecentage = progressData["transaction_lines_progress"]["Precentag"];
                        tlPrecentage = tlPrecentage != "" && tlPrecentage != null  ? tlPrecentage : 0;
                        this.progressIndicator =  `${ this.translate.instant('Data_index_processing_transaction_lines')} (${tlPrecentage}% ${this.translate.instant('Data_index_completed')})`;
                    }
                    else
                    {
                        this.clearProgressIndicator();
                    }
                }
                else // Publish was finished
                {
                    this.clearProgressIndicator();
                }
            }
        }
    }

    private clearProgressIndicator() {

        this.rebuildInProgress = false;
        if(this.progressIndicator != ""){
            this.indexingFaild = false;
            this.indexingError = "";
            this.progressIndicator = "";
        }

    }

    private getDistinctFieldsObj(fields:{key:string,value:string}[])
    {
        let distinctFields:{key:string,value:string}[] = [];
        let map = new Map();
        for (let field of fields) {
            let key = field.key;
            if(!map.has(key)){
                map.set(key, true);
                distinctFields.push({
                     key: key,
                    value: field.value
                });
            }
        }

        return distinctFields;
    }

    errorDetailsClick(){
        this.dataIndexService.openDialog(
            this.translate.instant(
                "Data_index_failure_details"
            ),
            this.indexingError
        );

    }

    onMenuItemClicked(event) {
        switch (event.source.key) {
            case 'delete_index': {
                this.dataIndexService.openDialog(
                    this.translate.instant("Data_index_delete_index"),
                    this.translate.instant("Data_index_delete_body"),
                    this.translate.instant("Data_index_Confirm"),
                    () =>{
                        this.rebuildInProgress = true;
                        this.dataIndexService.deleteIndex((res)=>{
                            if(res["success"] == true){

                                var message = res["success"] == true ? this.translate.instant("Data_index_delete_succeded") : this.translate.instant("Data_index_delete_faild");

                                this.dataIndexService.openDialog(
                                    this.translate.instant("Data_index_delete_index"),
                                    message,
                                    this.translate.instant("Data_index_OK"),
                                    () =>{
                                        this.rebuildInProgress = false;
                                        this.clearProgressIndicator();
                                    },
                                    false
                                    );
                            }
                        });
                    }
                );
                break;
            }
            default: {
                alert(event.apiName + " is not supported");
            }
        }
    }

    addFieldRow(tab){
        var self = this;
        self.fields[tab].push({type:tab, apiName:null, default:false})

    }

    deleteFieldRow(rowNum,tab){
        var self = this;
        self.fields[tab].splice(rowNum,1);
    }

    onTypeChange(event,rowNum, tab){
        var self = this;
        self.fields[tab][rowNum].type = event.value;
        self.fields[tab][rowNum].apiName = null;
    }

    onApiNameChange(event,rowNum, tab){
        var self = this;
        var apiName = event.value;
        self.fields[tab][rowNum].apiName = apiName;
        switch(tab)
        {
            // add field to Transaction api names list for Transaction lines tab
            case "all_activities":
                if(self.fields["all_activities"][rowNum].type == "all_activities"){
                    var res = self.typesFields["Transaction"].filter(field => {
                        return field.key === apiName;
                    })
                    if(res.length > 0) // it is transaction field - add to transaction lines transaction api names
                    {
                        self.transaction_lines_apiNames['Transaction'].push(res[0]);
                    };
                }
                break
        }
    }

    private delay = true;

    publishClicked(){
        //get the fields to save
        var data = {
            all_activities_fields: this.getIndexTypeFieldsToExport("all_activities"),
            transaction_lines_fields: this.getIndexTypeFieldsToExport("transaction_lines"),
            RunTime:null
        };

        //open dialog
        const dialogRef = this.dataIndexService.openPublishDialog(PublishDialogComponent);
        dialogRef.afterClosed().subscribe(dialogResult => {
            if(dialogResult)
            {
                this.rebuildInProgress = true;

                if(dialogResult.runType == "2"){ // type 2 is 'run at' option of the publish
                    //add run time to saved object
                    data.RunTime = this.getFormattedRunTime(dialogResult.runTime);
                }

                this.dataIndexService.publish(data,(result)=>{
                    this.indexingFaild = false;
                    this.progressIndicator = this.translate.instant('Data_index_initializing_publish');
                    this.setInterval();
                })
            }
            else
            {
                this.rebuildInProgress = false;
            }
        });

    }

    private getFormattedRunTime(runTime:any ) {
        var parts = runTime.split(':');
        var hour = parseInt(parts[0]);
        var minutes = parseInt(parts[1]);
        let date: Date = new Date();

        if (hour == 0 || date.getHours() > hour) // if midnight was chosen or hour that was passed - run in the next day
        {
            date.setDate(date.getDate() + 1);
        }
        date.setHours(hour);
        date.setMinutes(minutes);

        return date.toISOString();
    }

    private refreshProgressIndicator(intervalID) {

        this.dataIndexService.getUIData((uiData: any) => {

            this.uiData = uiData;

            var progressStatus = uiData['ProgressData']['Status'];
            var progressData = uiData['ProgressData'];

            this.rebuildInProgress = progressStatus == 'InProgress' ? true : (!progressData["RunTime"] && this.intervalCounter < 1); //the counter check is for caces the async publish didn't update the status yet (there is an old status from lat publish or it is empty on first publish) so we will wait two intervals

            this.setProgressIndicator(progressData);

            if(!this.rebuildInProgress)
                clearInterval(intervalID);

            this.menuOptions = [{ key: 'delete_index', text: this.translate.instant('Data_index_delete_index') ,disabled:this.rebuildInProgress}];
            this.intervalCounter++;

        });

    }

    private getIndexTypeFieldsToExport(indexType: string) {
        var fieldsToExport : any = [];
        this.fields[indexType].forEach(fieldObj => {
            var field = fieldObj.apiName;
            if (field != null) { // igmoe unselected api names in the UI
                if (fieldObj.type != indexType) { // I made the key to be always the full prefix - Account in all activities and Transaction.Account in transaction_lines
                    field = `${fieldObj.type}.${field}`;
                }
                fieldsToExport.push({fieldID: field, type: this.getFieldType(fieldObj)});
            }
        });

        return fieldsToExport;

    }

    private getFieldType(fieldObj){
        let type;
        if(fieldObj.type == "all_activities"){
            type = this.fieldIDtoType["Activity"][fieldObj.apiName] ? this.fieldIDtoType["Activity"][fieldObj.apiName] : this.fieldIDtoType["Transaction"][fieldObj.apiName]
        }
        else {
            let objectType = fieldObj.type
            if(objectType.includes(".")){// e.g Transaction.Agent
                objectType = objectType.substring(objectType.lastIndexOf('.')+1) // take the Agent
            }
            type = this.fieldIDtoType[objectType][fieldObj.apiName]
        }
        return type
    }



}
