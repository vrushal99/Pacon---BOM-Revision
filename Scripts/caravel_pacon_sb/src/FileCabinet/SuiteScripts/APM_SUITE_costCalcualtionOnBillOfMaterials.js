/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

/***********************************************************************
 * Description:  This Script will work on 'Bill of Materials Revision' record.
 * when user click on 'Cost Calculation' Button, Then script will execute and
 * A) check item type as follows:
 
          1) If item type is 'Inventory Item' then script will get the 'Purchase Price' 
             from 'Inventory Item' record and set on the 'Calculated Cost' line field for 
             that item.
          2) If item type is 'Assembly Item' then script will check 'Bill of Materials
             Revision' record ' and get the 'Component Cost Total' field value from it and 
             set on the 'Calculated Cost' line field for current line item.

* B) Also script will check 'Manufacturing Routing' record on 'Assemlby Item' for current
     'Bill of Material' record present on 'Bill of Material Revision' Record.

          1) If 'Manufacturing Routing' record is present then script will get the 'Setup Time'
              and 'Run Time' and also get the 'Fixed Rate' and 'Run Rate' from 'Manufacturing 
              Cost Template' record, Then it will make Total Time Calculation in Hours.

* C) After all calculation is done, script will calculate the addition of all 'Calculated Cost'
     value present on line item and add added into total time calculation and then set on the 
     'Component Cost Total' field for current 'Bill of Material Revision' record. 

 
 * Version: 1.0.0 - Initial version
 * Author:  Caravel/Palavi Rajgude
 * Date:    09-05-2022
 
 ***********************************************************************/

define(["N/record", "N/search", "N/redirect", "N/url", "N/https"], function ( record, search, redirect, url, https) {

  /**
   * @param {function} costCalculation - Function use to calculate cost on bill of materials record.
   * @param {object  } context         - All data related to record in context.
   */

  function costCalculation(context) {

    try {

      let requestParam = context.request.parameters;
      let recId = requestParam.recId;
      let main = requestParam.main;

      //pass record id to 'getCurrentRevision' function
      let value = getCurrentRevision(recId);

      value = JSON.stringify(value);

      if (main === true || main === "true") {

        //after click on 'Cost Calculation' button, then script will redirect to same page with parameter 'recId'
        redirect.toRecord({ type: "bomrevision", id: recId });

      } else {

        context.response.write(value);

      }
    } 
    
    catch (e) {
      log.debug({
        title: "Error in costCalculation() function",
        details: e.toString(),
      });
    }
  }

  /**
   * @param {function} getCurrentRevision - Function use to get current revision record from bill of materials record.
   * @param {number }  recId              - Bill of materials record id.
   */
  function getCurrentRevision(recId) {

    try {

      let subtotalCost;
      let totalCostRevision = 0;
      let manufacCostRevision = 0;

      //load 'Bill of Materials Revision' record
      let loadBillsOfMaterials = record.load({
        type: "bomrevision",
        id: recId,
      });

      let getBillOfMaterialId = loadBillsOfMaterials.getValue({
        fieldId: "billofmaterials",
      });

      let getItemCount = loadBillsOfMaterials.getLineCount({
        sublistId: "component",
      });

      //pass bill of materials id to 'manufactureringRouting' function and get the final cost time calculation 
      manufacCostRevision = manufacturingRouting(getBillOfMaterialId) || 0;

      //loop through all line item of 'Bill of Materials Revision' record
      for (let i = 0; i < getItemCount; i++) {

        let itemId = loadBillsOfMaterials.getSublistValue({
          sublistId: "component",
          fieldId: "item",
          line: i,
        });

        //lookup for item type of line items
        let itemType = search.lookupFields({
          type: search.Type.ITEM,
          id: itemId,
          columns: ["type"],
        });

        let itemTypeValue = itemType.type[0].value;

        //condition for check item type is 'Assembly Item' and calculate cost for 'Assembly Item'
        if (itemTypeValue == "Assembly") {

          //load assembly item record
          let loadAssemblyItem = record.load({
            type: "assemblyitem",
            id: itemId,
          });

          let getAsssemblyCount = loadAssemblyItem.getLineCount({
            sublistId: "billofmaterials",
          });

          //set value '0' on 'Calculated Cost' line field for 'Assembly Item' if no 'Bill of Materials Revision' record present on it
          if (getAsssemblyCount == 0) {

            setValueZero(loadBillsOfMaterials,i);
            continue;
          }

          let bomRevisionId = getBomRevisionId(
            getAsssemblyCount,
            loadAssemblyItem
          );

          //pass bill of materials revision id to 'callSuitelet' and get the subtotal cost
          subtotalCost = callSuitelet(bomRevisionId);

          //set 'subtotal cost on 'Calculated Cost' line field for 'Assembly Item'
          loadBillsOfMaterials.setSublistValue({
            sublistId: "component",
            fieldId: "custrecord_rev_conversion",
            line: i,
            value: parseFloat(subtotalCost),
          });


          totalCostRevision = parseFloat(totalCostRevision) + parseFloat(subtotalCost);
          // log.debug('totalCostRevision in assembly', totalCostRevision);
        } 
        
        else {

          //lookup for getting 'purchase price' from 'Inventory Item' record
          let lookupOnItemRecord = search.lookupFields({
            type: search.Type.ITEM,
            id: itemId,
            columns: ["cost"],
          });

          let itemCost = lookupOnItemRecord.cost;

          //set value '0' on 'Calculated Cost' line field for 'Inventory Item' if no 'purchase price' is present on it
          if (!itemCost) {

            setValueZero(loadBillsOfMaterials,i);
            continue;
          }

          itemCost = parseFloat(itemCost);

          itemCost = itemCost || 0;

          if (_logValidation(itemCost)) {

            //set 'purchase price on 'Calculated Cost' line field for 'Inventory Item'
            loadBillsOfMaterials.setSublistValue({
              sublistId: "component",
              fieldId: "custrecord_rev_conversion",
              line: i,
              value: parseFloat(itemCost) || 0,
            });
          }
        
          totalCostRevision = parseFloat(totalCostRevision) + parseFloat(itemCost);
          // log.debug('totalCostRevision in item', totalCostRevision);
        }
      }

      totalCostRevision = parseFloat(totalCostRevision) + parseFloat(manufacCostRevision);
      // log.debug('totalCostRevision in main', totalCostRevision);

      //set value 'totalCostRevision' on 'Component Cost Total' field for 'Bill of Materials Revision' record
      loadBillsOfMaterials.setValue({
        fieldId: "custrecord_component_cost",
        value: parseFloat(totalCostRevision) || 0,
      });

      // log.audit(`totalCostRevision ${recId}`, totalCostRevision);

      loadBillsOfMaterials.save();

      return totalCostRevision;

    } catch (err) {
      log.debug({
        title: "error in getCurrentRevision() record",
        details: err.toString(),
      });
    }
  }

  /**
   * @date    2022-05-08
   * @param   {function} getBomRevisionId - Function use to get bill of material revision record id.
   * @param   {number} getAsssemblyCount  - Count of assembly item.
   * @param   {object} loadAssemblyItem   - Load assembly item record.
   * @returns {number} bomRevisionId      - Returns Bill of Materials Revision id.
   */
  function getBomRevisionId(getAsssemblyCount, loadAssemblyItem) {

    //loop through bill of material line item on 'Assembly Item' record
    for (let j = 0; j < getAsssemblyCount; j++) {

      //get 'Bill of Materials Revision' id from 'Assembly Item' record
      let getBillOfMaterialsRevision = loadAssemblyItem.getSublistValue({
        sublistId: "billofmaterials",
        fieldId: "currentrevision",
        line: j,
      });

      //search for getting 'Bill of Materials Revision' id
      let bomrevisionSearchObj = search.create({
        type: "bomrevision",
        filters: [["name", "is", getBillOfMaterialsRevision]],
        columns: [
          search.createColumn({
            name: "internalid",
            sort: search.Sort.ASC,
            label: "Internal ID",
          }),
          search.createColumn({ name: "name", label: "Name" }),
        ],
      });

      let bomSearchObjResult = bomrevisionSearchObj.run().getRange(0, 1000);

      var bomRevisionId = bomSearchObjResult[0].getValue({
        name: "internalid",
      });
    }
    return bomRevisionId;
  }

  /**
   * @date    2022-05-08
   * @param   {function} manufacturingRouting - Function use to get manufacturing routing cost using run time and setup time values.
   * @param   {number} getBillOfMaterialId    - Bill of materials id.
   * @returns {number} totalTimeCalculation   - Returns total time calculation from manufacturing routing record.
   */
  function manufacturingRouting(getBillOfMaterialId) {

    try {

      let finalTimeCalculation = [];
      let timeToBomRevision;
      let totalTimeCalculation = 0;

      //pass bill of materials id to 'manufacturingSearch' function and get search result
      manufacturingroutingSearchObjResult = manufacturingSearch(getBillOfMaterialId);

      //loop through search result
      for (let i = 0; i < manufacturingroutingSearchObjResult.length; i++) {

        let getSetupTime = manufacturingroutingSearchObjResult[i].getValue({
          name: "setuptime",
        });

        //convert setup time in hours
        let setupTimeInHours = getSetupTime / 60;

        let getRunRate = manufacturingroutingSearchObjResult[i].getValue({
          name: "runrate",
        });

        //convert run rate in hours
        let runRateInHours = getRunRate / 60;

        if (getRunRate == 0) {
          continue;
        }

        //getting 'manufacturing cost template' id from 'manufacturing routing' record
        let getManufacturingCostTemplateId = manufacturingroutingSearchObjResult[i].getValue({
            name: "internalid",
            join: "manufacturingCostTemplate",
          });

        let timeObject = {
          setupTimeInHours: setupTimeInHours,
          runRateInHours: runRateInHours,
          getManufacturingCostTemplateId: getManufacturingCostTemplateId,
        };

        //pass 'timeObject' to 'manufacturingCostTemplate' function and get time calculation
        timeToBomRevision = manufacturingCostTemplate(timeObject);

        finalTimeCalculation.push(timeToBomRevision);
      }

      //loop through 'finalTimeCalculation' array and calculate sum of all time calculation
      for (let i = 0; i < finalTimeCalculation.length; i++) {

        for (let j = 0; j < finalTimeCalculation[i].length; j++) {

          totalTimeCalculation = totalTimeCalculation + finalTimeCalculation[i][j];
        }

      }

      return totalTimeCalculation;

    } catch (err) {
      log.debug({
        title: "err in manufacturingRouting() function",
        details: err.toString(),
      });
    }
  }

  /**
   * @date 2022-05-08
   * @param {function} manufacturingCostTemplate - Function use to get fixed rate and run rate from manufacturing cost template and calculate total time.
   * @param   {object} timeObject                - Object to pass setup time, run rate and manufacturing cost template id.
   * @returns {Array} finalTimeArray             - Returns calculation of time in array.
   */
  function manufacturingCostTemplate(timeObject) {

    try {

      let { setupTimeInHours, runRateInHours, getManufacturingCostTemplateId } = timeObject;

      let finalSetupTimeArr = [];
      let finalRunRateArr = [];
      let finalTimeArr = [];

      //load manufacturing cost template record
      let loadManufacturingCostTemplate = record.load({
        type: "manufacturingcosttemplate",
        id: getManufacturingCostTemplateId,
      });

      let getCostCount = loadManufacturingCostTemplate.getLineCount({
        sublistId: "costdetail",
      });

      for (let m = 0; m < getCostCount; m++) {

        let getFixedRate = loadManufacturingCostTemplate.getSublistValue({
          sublistId: "costdetail",
          fieldId: "fixedrate",
          line: m,
        });

        let getRunRateTemp = loadManufacturingCostTemplate.getSublistValue({
          sublistId: "costdetail",
          fieldId: "runrate",
          line: m,
        });

        //if fixed rate value is present then make multiplication with setup time and push into 'finalSetupTimeArr' array
        if (getFixedRate) {

          let finalSetupTime = setupTimeInHours * getFixedRate;
          finalSetupTimeArr.push(finalSetupTime);

        }
        //else run rate value is present then make multiplication with run rate and push into 'finalRunRateArr' array
        else {

          let finalRunTime = runRateInHours * getRunRateTemp;
          finalRunRateArr.push(finalRunTime);

        }
      }

      //concat both array
      finalTimeArr = finalSetupTimeArr.concat(finalRunRateArr);

      return finalTimeArr;

    } catch (err) {
      log.debug({
        title: "err in manufacturingCostTemplate() function",
        details: err.toString(),
      });
    }
  }

  /**
   * @date 2022-05-08
   * @param {function}  callSuitelet - Calls this suitelet for every current revision BOM Caculation Amount.
   * @param   {number}  recId        - BOM Current Revision Record ID.
   * @returns {number}  response     - The totalAmount sum for the Current Revision Record ID.
   */
  function callSuitelet(recId) {

    let suiteletURL = url.resolveScript({
      scriptId: "customscript_apm_sl_costcalcualtion",
      deploymentId: "customdeploy_apm_sl_costcalcualtion",
      params: {
        recId: recId,
      },
      returnExternalUrl: true,
    });

    let response = https.get({
      url: suiteletURL,
    });

    if (_logValidation(response)) {
      response = JSON.parse(response.body);
    }

    return response;
  }

  /**
   * @date 2022-05-08
   * @param {function} _logValidation - Validates the response from the suitelet.
   * @param {number} value            - Contains the response from the suitelet.
   * @returns {boolean}               - Returns true if the response is valid otherwise false.
   */
  function _logValidation(value) {
    if (
      value != null &&
      value != "" &&
      value != "null" &&
      value != undefined &&
      value != "undefined" &&
      value != "@NONE@" &&
      value != "NaN"
    ) {
      return true;
    } else {
      return false;
    }
  }
  /**
   * @date 2022-05-08
   * @param {function} setValueZero - Sets the value to zero if the value is not defined.
   * @param  {number} i             - Line number on line item.
   */
  function setValueZero(loadBillsOfMaterials,i){

    try{

    let costValue = 0;

    //set value to zero if value is not defined
    loadBillsOfMaterials.setSublistValue({
      sublistId: "component",
      fieldId: "custrecord_rev_conversion",
      line: i,
      value: costValue,
    });

  }
  catch(err){
    log.debug({
      title: "err in setValueZero() function",
      details: err.toString(),
    });

  }
}
/**
 * @date 2022-05-08
 * @param {function} manufacturingSearch - Searches the manufacturing routing for the Bill of Material ID.
 * @param  {number} getBillOfMaterialId  - Bill of Material ID.
 * @returns {object} manufacturingroutingSearchObjResult - Returns the search result of manufacturing routing records.
 */
function manufacturingSearch(getBillOfMaterialId){

  try{

  //search on manufacturing routing records
  let manufacturingroutingSearchObj = search.create({
    type: "manufacturingrouting",
    filters: [["billofmaterials", "anyof", getBillOfMaterialId]],
    columns: [
      search.createColumn({
        name: "name",
        sort: search.Sort.ASC,
        label: "Name",
      }),
      search.createColumn({
        name: "billofmaterials",
        label: "Bill of Materials",
      }),
      search.createColumn({ name: "internalid", label: "Internal ID" }),
      search.createColumn({ name: "setuptime", label: "Setup Time" }),
      search.createColumn({ name: "runrate", label: "Run Rate" }),
      search.createColumn({
        name: "internalid",
        join: "manufacturingCostTemplate",
        label: "Internal ID",
      }),
    ],
  });

  let manufacturingroutingSearchObjResult = manufacturingroutingSearchObj
    .run()
    .getRange(0, 1000);

    return manufacturingroutingSearchObjResult;
  }
  catch(err){
    log.debug({
      title: "err in manufacturingSearch() function",
      details: err.toString(),
    });

  }

}

  return { onRequest: costCalculation };
});
