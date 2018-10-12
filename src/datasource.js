import _ from "lodash";
import moment from "moment";
import * as jp from './libs/jsonpath.js';

export class GenericDatasource {

    constructor(instanceSettings, $q, backendSrv, templateSrv,alertSrv, contextSrv, dashboardSrv) {

        this.type = instanceSettings.type;
        this.url = instanceSettings.url;
        this.name = instanceSettings.name;
        this.q = $q;
        this.backendSrv = backendSrv;
        this.templateSrv = templateSrv;
        this.withCredentials = instanceSettings.withCredentials;
        this.headers = {'Content-Type': 'application/json'};
        this.alertSrv = alertSrv;
        this.contextSrv = contextSrv;
        this.dashboardSrv = dashboardSrv;
        this.notificationShowTime = 5000;
        if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
            this.headers['Authorization'] = instanceSettings.basicAuth;
        }
    }

    getTimeFilter(options,key){
        let from = options.range.from.utc().format("YYYY-MM-DDTHH:mm:ss.SSS")+"Z";
        let to = options.range.to.utc().format("YYYY-MM-DDTHH:mm:ss.SSS")+"Z";
        return key + " gt " + from + " and "+ key + " lt " + to;
    }

    getFormatedId(id) {
        return (Number.isInteger(id) || !isNaN(id)) ? id : "'"+id+"'";
    }

    query(options) {
        // var cities = [
        //     { name: "London", "population": 8615246 },
        //     { name: "Berlin", "population": 3517424 },
        //     { name: "Madrid", "population": 3165235 },
        //     { name: "Rome",   "population": 2870528 }
        // ];
        // var names = jsonpath.query(cities, '$..name');
        //
        // console.log(names);
        // Filter targets that are set to hidden
        options.targets = _.filter(options.targets, target => {
            return target.hide != true;
        });

        let allPromises = [];

        if (_.find(options.targets, {"panelType" : 'grafana-worldmap-panel'})) {
            _.forEach(options.targets,function(target,targetIndex){
                let self = this;
                let suburl = '';

                if (target.selectedThingId == 0) return;
                let timeFilter = this.getTimeFilter(options,"time");
                suburl = '/Things(' + this.getFormatedId(target.selectedThingId) + ')/HistoricalLocations?'+'$filter='+timeFilter+'&$expand=Locations';

                allPromises.push(this.doRequest({
                    url: this.url + suburl,
                    method: 'GET'
                }).then(function(response){
                    return self.transformLocationsCoordinates(target,targetIndex,response.data.value);
                }));

            }.bind(this));

            return Promise.all(allPromises).then(function(values) {
                let allCoordinates = [];
                _.forEach(values,function(value){
                    allCoordinates = allCoordinates.concat(value);
                });
                return {data: allCoordinates};
            });
        }

        let self = this;
        let allTargetResults = {data:[]};

        _.forEach(options.targets,function(target){
            let self = this;
            let suburl = '';
            if (target.selectedDatastreamDirty) {
                allTargetResults.data.push({
                    'target' : target.selectedDatastreamName.toString(),
                    'datapoints' : [],
                });
                return;
            }

            if (_.isEqual(target.type,"Locations")) {
                if (target.selectedLocationId == 0) return;
                let timeFilter = this.getTimeFilter(options,"time");
                suburl = '/Locations(' + this.getFormatedId(target.selectedLocationId) + ')/HistoricalLocations?'+'$filter='+timeFilter+'&$expand=Things';
            } else if(_.isEqual(target.type,"Historical Locations")){
                if (target.selectedThingId == 0) return;
                let timeFilter = this.getTimeFilter(options,"time");
                suburl = '/Things(' + this.getFormatedId(target.selectedThingId) + ')/HistoricalLocations?'+'$filter='+timeFilter+'&$expand=Locations';
            } else {
                if (target.selectedDatastreamId == 0) return;
                let timeFilter = this.getTimeFilter(options,"phenomenonTime");
                suburl = '/Datastreams('+this.getFormatedId(target.selectedDatastreamId)+')/Observations?'+'$filter='+timeFilter;
            }

            allPromises.push(this.doRequest({
                url: this.url + suburl,
                method: 'GET'
            }).then(function(response){
                let transformedResults = [];
                if (_.isEqual(target.type,"Locations")) {
                    transformedResults = self.transformThings(target,response.data.value);
                } else if(_.isEqual(target.type,"Historical Locations")){
                    transformedResults = self.transformLocations(target,response.data.value);
                } else {
                    transformedResults = self.transformDataSource(target,response.data.value);
                }
                return transformedResults;
            }));

        }.bind(this));

        return Promise.all(allPromises).then(function(values) {
            _.forEach(values,function(value){
                allTargetResults.data.push(value);
            });
            return allTargetResults;
        });
    }

    transformLocationsCoordinates(target,targetIndex,values){
        let result = [];
        let timestamp = "";
        let lastLocation = false;
        let lastLocationValue = "";
        if (values && values.length > 0) {
            let lastLocation = values[0].Locations[0];
            result.push({
                "key": lastLocation.name,
                "latitude": lastLocation.location.coordinates[0],
                "longitude": lastLocation.location.coordinates[1],
                "name": lastLocation.name + " | " +target.selectedThingName + " | " + moment(values[0].time,"YYYY-MM-DDTHH:mm:ss.SSSZ").format('YYYY-MM-DD HH:mm:ss.SSS'),
                "value": targetIndex+1,
            });
        }
        return result;
    }

    transformDataSource(target,values){
        let self = this;

        if (self.isOmObservationType(target.selectedDatastreamObservationType) && _.isEmpty(target.jsonQuery)) {
            return {
                'target' : target.selectedDatastreamName.toString(),
                'datapoints' : []
            };
        }

        let datapoints = _.map(values,function(value,index){

            if (target.panelType == "table") {

                if (self.isOmObservationType(target.selectedDatastreamObservationType)) {
                    var result = JSONPath({json: value.result, path: target.jsonQuery});
                    return [result[0],parseInt(moment(value.phenomenonTime,"YYYY-MM-DDTHH:mm:ss.SSSZ").format('x'))];
                }

                return [_.isEmpty(value.result.toString()) ? '-' : value.result ,parseInt(moment(value.phenomenonTime,"YYYY-MM-DDTHH:mm:ss.SSSZ").format('x'))];
            }

            if (self.isOmObservationType(target.selectedDatastreamObservationType)) {
                var result = JSONPath({json:value.result, path: target.jsonQuery});
                return [result[0],parseInt(moment(value.phenomenonTime,"YYYY-MM-DDTHH:mm:ss.SSSZ").format('x'))];
            }

            // graph panel type expects the value in float/double/int and not as strings
            return [value.result,parseInt(moment(value.phenomenonTime,"YYYY-MM-DDTHH:mm:ss.SSSZ").format('x'))];
        });

        datapoints = _.filter(datapoints, function(datapoint) { return (typeof datapoint[0] === "string" || typeof datapoint[0] === "number" || (Number(datapoint[0]) === datapoint[0] && datapoint[0] % 1 !== 0)); });

        let transformedObservations = {
            'target' : target.selectedDatastreamName.toString(),
            'datapoints' : datapoints
        };

        return transformedObservations;
    }

    isOmObservationType(type) {
        if (_.isEmpty(type)) {
            return false;
        }

        if (!type.includes('om_observation')) {
            return false;
        }

        return true;
    }

    transformThings(target,values){
        return {
            'target' : target.selectedLocationName.toString(),
            'datapoints' : _.map(values,function(value,index){
                return [_.isEmpty(value.Thing.name) ? '-' : value.Thing.name,parseInt(moment(value.time,"YYYY-MM-DDTHH:mm:ss.SSSZ").format('x'))];
            })
        };
    }

    transformLocations(target,values) {
        let result = [];
        _.forEach(values,function(value) {
            _.forEach(value.Locations,function(location) {
                result.push([_.isEmpty(location.name) ? '-' : location.name,parseInt(moment(value.time,"YYYY-MM-DDTHH:mm:ss.SSSZ").format('x'))]);
            });
        });
        return {
            'target' : target.selectedThingName.toString(),
            'datapoints' : result
        };
    }

    testDatasource() {
        return this.doRequest({
            url: this.url,
            method: 'GET',
        }).then(response => {
            if (response.status === 200) {
                return { status: "success", message: "Data source is working", title: "Success" };
            }
        });
    }

    metricFindQuery(query,suburl,type) {
        return this.doRequest({
            url: this.url + suburl,
            method: 'GET',
        }).then((result) => {
            return this.transformMetrics(result.data.value,type);
        });
    }

    transformMetrics(metrics,type) {
        let placeholder = "select a sensor";
        if (type == "thing") {
            placeholder = "select a thing";
        } else if (type == "datastream") {
            placeholder = "select a datastream";
        } else if (type == "location") {
            placeholder = "select a location";
        }
        let transformedMetrics = [{
            text: placeholder,
            value: 0,
            type: ''
        }];
        _.forEach(metrics, (metric,index) => {
            transformedMetrics.push({
                text: metric.name + " ( " + metric['@iot.id'] + " )",
                value: metric['@iot.id'],
                type: metric['observationType']
            });
        });
        return transformedMetrics;
    }

    doRequest(options) {
        options.withCredentials = this.withCredentials;
        options.headers = this.headers;

        return this.backendSrv.datasourceRequest(options);

    }
}
