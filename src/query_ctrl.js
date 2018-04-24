import {QueryCtrl} from 'app/plugins/sdk';
import './css/query-editor.css!'
export class GenericDatasourceQueryCtrl extends QueryCtrl {

    constructor($scope, $injector)  {
        super($scope, $injector);

        this.scope = $scope;

        this.target.type = this.target.type || 'Sensor';

        // sensor init start
        this.target.senTarget = this.target.senTarget || 'select a sensor';
        this.allSensors  = {};
        this.target.selectedSensorId = this.target.selectedSensorId || 0;
        // sensor init end

        // thing init start
        this.target.thingTarget = this.target.thingTarget || 'select a thing';
        this.allThings  = {};
        this.target.selectedThingId = this.target.selectedThingId || 0;
        // thing init end

        // datasource init start
        this.target.dsTarget = this.target.dsTarget || 'select metric';
        this.allDataSources  = {};
        this.target.datastreamID = this.target.datastreamID || 0;
        // datasource init end
    }

    sleep(delay) {
        var start = new Date().getTime();
        while (new Date().getTime() < start + delay){

        };
    }


    getOptions(query) {
        let self = this;
        let targetUrl = "";
        if (this.target.type == 'Sensor') {
            targetUrl = "/Sensors("+this.target.selectedSensorId+")/Datastreams";
        } else {
            targetUrl = "/Things("+this.target.selectedThingId+")/Datastreams";
        }
        return this.datasource.metricFindQuery((query || ''),targetUrl).then((result)=>{
            self.allDataSources = result;
            return result;
        });
    }

    showSensors(){
        return this.target.type == 'Sensor';
    }

    showThings(){
        return this.target.type == 'Thing';
    }

    getSensors(query) {
        let self = this;
        return this.datasource.metricFindQuery((query || ''),"/Sensors").then((result)=>{
            self.allSensors = result;
            return result;
        });
    }

    toggleEditorMode() {
        this.target.rawQuery = !this.target.rawQuery;
    }

    onChangeInternal(query) {
        let selectedDataSource =_.find(this.allDataSources, { 'value' : this.target.dsTarget });
        if (selectedDataSource) {
            this.target.datastreamID = selectedDataSource.id ;
        } else {
            this.target.datastreamID = 0 ;
        }
        this.panelCtrl.refresh();
    }

    onSensorChange(query) {
        this.target.dsTarget = "select metric";
        let selectedSensor =_.find(this.allSensors, { 'value' : this.target.senTarget });
        if (selectedSensor) {
            this.target.selectedSensorId = selectedSensor.id ;
        } else {
            this.target.selectedSensorId = 0 ;
        }
        this.onChangeInternal();
    }

    typeChanged(type) {
        // resetting and refreshing panel if type(sensor or thing) changed
        this.target.dsTarget = "select metric";
        this.target.senTarget = "select a sensor";
        this.target.thingTarget = "select a thing";
        this.target.selectedSensorId = 0;
        this.target.selectedThingId = 0;
        this.onChangeInternal();
    }

    getThings(query) {
        let self = this;
        return this.datasource.metricFindQuery((query || ''),"/Things").then((result)=>{
            self.allThings = result;
            return result;
        });
    }

    onThingChange(query) {
        this.target.dsTarget = "select metric";
        let selectedThing =_.find(this.allThings, { 'value' : this.target.thingTarget });
        if (selectedThing) {
            this.target.selectedThingId = selectedThing.id ;
        } else {
            this.target.selectedThingId = 0 ;
        }
        this.onChangeInternal();
    }

}

GenericDatasourceQueryCtrl.templateUrl = 'partials/query.editor.html';
