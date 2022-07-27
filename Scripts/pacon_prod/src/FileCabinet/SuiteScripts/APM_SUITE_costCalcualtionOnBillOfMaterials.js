/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */

define([
  "N/record",
  "N/search",
  "N/redirect",
  "N/runtime",
  "N/url",
  "N/https"
], function (record, search, redirect, runtime, url, https) {
  /**
   * @param {function} costCalculation - Function use to calculate cost on bill of materials record
   * @param {object  } context         - all data related to record in context
   */
  function costCalculation(context) {
    try {
      let requestParam = context.request.parameters;

      let recId = requestParam.recId;
      let main = requestParam.main;

      let value = getCurrentRevision(recId);

      value = JSON.stringify(value);
      //log.debug({ title: "value in suitelet" + recId, details: value });

      if (main === true || main === "true") {
        redirect.toRecord({ type: "bomrevision", id: recId });
      } else {
        context.response.write(value);
      }
    } catch (e) {
      log.debug({ title: "Error in costCalculation() function", details: e.toString() });
    }
  }

  /**
   * @param {function} getCurrentRevision - Function use to get current revision record from bill of materials record
   * @param {number }  recId              - Bill of materials record id
   */
  function getCurrentRevision(recId) {
    try {

      let remainingUsage = runtime.getCurrentScript().getRemainingUsage();
      //log.debug(`remainingUsage ${recId} `, remainingUsage);
      //log.debug("revision recId", recId);

      let subtotalCost;
      let totalCostRevision = 0;
      let manufacCostRevision = 0;
      let loadBillsOfMaterials = record.load({ type: "bomrevision", id: recId });
      let getBillOfMaterialId = loadBillsOfMaterials.getValue({ fieldId: "billofmaterials" });
      //log.debug("getBillOfMaterialId", getBillOfMaterialId);
      let getItemCount = loadBillsOfMaterials.getLineCount({ sublistId: "component" });
      // if (recId == 22) {   log.debug({     title: "getItemCount",     details: getItemCount   }); }

      for (let i = 0; i < getItemCount; i++) {
        let itemId = loadBillsOfMaterials.getSublistValue({ sublistId: "component", fieldId: "item", line: i }); 
        var itemId_Text = loadBillsOfMaterials.getSublistText({ sublistId: "component", fieldId: "item", line: i });
        //log.debug({ title: "itemId", details: itemId });

        let itemType = search.lookupFields({ type: search.Type.ITEM, id: itemId, columns: ["type"] });

        let itemTypeValue = itemType.type[0].value;
        //log.debug({ title: `itemType ${itemId_Text} ${recId}`, details: itemType });

        if (itemTypeValue == "Assembly") {
          let loadAssemblyItem = record.load({ type: "assemblyitem", id: itemId });

          let getAsssemblyCount = loadAssemblyItem.getLineCount({ sublistId: "billofmaterials" });
          //log.debug({ title: "getAsssemblyCount", details: getAsssemblyCount });
         

          if (getAsssemblyCount == 0) {
            loadBillsOfMaterials.setSublistValue({ sublistId: "component", fieldId: "custrecord_rev_conversion", line: i, value: 0 });
            continue;
          }

          //!! merge next two lines
          let bomRevisionId = getBomRevisionId( getAsssemblyCount, loadAssemblyItem );

          subtotalCost = callSuitelet(bomRevisionId);
          //log.debug( `subtotalCost of the revision ${recId} ${itemId_Text} `, subtotalCost ); 
          //log.debug( ` TYPE subtotalCost of the revision ${recId} ${itemId_Text} `, typeof subtotalCost );

          manufacCostRevision = manufacturingRouting(getBillOfMaterialId) || 0;
          //log.debug(`manufacCostRevision b ${recId} ${itemId_Text}`, manufacCostRevision);

          let finalSubtotalCost = subtotalCost + manufacCostRevision;
          //log.debug(`finalSubtotalCost b ${recId} ${itemId_Text}`, finalSubtotalCost);

          loadBillsOfMaterials.setSublistValue({
            sublistId: "component",
            fieldId: "custrecord_rev_conversion",
            line: i,
            value: parseFloat(finalSubtotalCost)
          });
          //log.debug("totalCostRevision before adding", totalCostRevision);

          totalCostRevision = parseFloat(totalCostRevision) + parseFloat(finalSubtotalCost);
          //log.debug(`subtotalCost b ${recId} ${itemId_Text}`, totalCostRevision);

        } else {
          let lookupOnItemRecord = search.lookupFields({
            type: search.Type.ITEM,
            id: itemId,
            columns: ["cost"]
          });

          let itemCost = lookupOnItemRecord.cost;
          itemCost = parseFloat(itemCost)
          //log.debug({ title: "itemCost", details: itemCost });

          itemCost = itemCost || 0;

          if (_logValidation(itemCost)) {
            loadBillsOfMaterials.setSublistValue({
              sublistId: "component",
              fieldId: "custrecord_rev_conversion",
              line: i,
              value: parseFloat(itemCost) || 0
            });
          }
          //invPurchasePrice = parseFloat(invPurchasePrice);

          totalCostRevision = totalCostRevision + itemCost;
        }
      }

      loadBillsOfMaterials.setValue({
        fieldId: "custrecord_component_cost",
        value: parseFloat(totalCostRevision) || 0
      });
      log.audit(`totalCostRevision ${recId}`, totalCostRevision);

      loadBillsOfMaterials.save();

      return totalCostRevision;
    } catch (err) {
      log.debug({
        title: "err in getCurrentRevision",
        details: err
      });
    }
  }

  /**
   * @date    2022-05-08
   * @param   {any} getAsssemblyCount
   * @param   {any} loadAssemblyItem
   * @returns {any}
   */
  function getBomRevisionId(getAsssemblyCount, loadAssemblyItem) {
    for (let j = 0; j < getAsssemblyCount; j++) {
      let getBillOfMaterialsRevision = loadAssemblyItem.getSublistValue({
        sublistId: "billofmaterials",
        fieldId: "currentrevision",
        line: j
      });

      // if (recId == 22) {
      //   log.debug(
      //     "getBillOfMaterialsRevision",
      //     getBillOfMaterialsRevision
      //   );
      // }
      let bomrevisionSearchObj = search.create({
        type: "bomrevision",
        filters: [["name", "is", getBillOfMaterialsRevision]],
        columns: [
          search.createColumn({
            name: "internalid",
            sort: search.Sort.ASC,
            label: "Internal ID"
          }),
          search.createColumn({ name: "name", label: "Name" })
        ]
      });

      let bomSearchObjResult = bomrevisionSearchObj.run().getRange(0, 1000);

      // if (recId == 22) {
      //   log.debug({
      //     title: "bomSearchObjResult",
      //     details: bomSearchObjResult
      //   });
      // }
      var bomRevisionId = bomSearchObjResult[0].getValue({
        name: "internalid"
      });
    }
    return bomRevisionId;
  }

  /**
   * @date    2022-05-08
   * @param   {any} getBillOfMaterialId
   * @returns {any}
   */
  function manufacturingRouting(getBillOfMaterialId) {
    try {
      let finalTimeCalculation = [];

      let manufacturingroutingSearchObj = search.create({
        type: "manufacturingrouting",
        filters: [["billofmaterials", "anyof", getBillOfMaterialId]],
        columns: [
          search.createColumn({
            name: "name",
            sort: search.Sort.ASC,
            label: "Name"
          }),
          search.createColumn({
            name: "billofmaterials",
            label: "Bill of Materials"
          }),
          search.createColumn({ name: "internalid", label: "Internal ID" }),
          search.createColumn({ name: "setuptime", label: "Setup Time" }),
          search.createColumn({ name: "runrate", label: "Run Rate" }),
          search.createColumn({
            name: "internalid",
            join: "manufacturingCostTemplate",
            label: "Internal ID"
          })
        ]
      });

      let manufacturingroutingSearchObjResult = manufacturingroutingSearchObj
        .run()
        .getRange(0, 1000);

      // log.debug({
      //   title: "manufacturingroutingSearchObjResult",
      //   details: manufacturingroutingSearchObjResult
      // });

      let timeToBomRevision;

      for (let i = 0; i < manufacturingroutingSearchObjResult.length; i++) {
        let getSetupTime = manufacturingroutingSearchObjResult[i].getValue({
          name: "setuptime"
        });

        let setupTimeInHours = getSetupTime / 60;

        //log.debug("setupTimeInHours", setupTimeInHours);

        let getRunRate = manufacturingroutingSearchObjResult[i].getValue({
          name: "runrate"
        });

        let runRateInHours = getRunRate / 60;

        //log.debug("runRateInHours", runRateInHours);

        if (getRunRate == 0) {
          continue;
        }

        let getManufacturingCostTemplateId =
          manufacturingroutingSearchObjResult[i].getValue({
            name: "internalid",
            join: "manufacturingCostTemplate"
          });

        // log.debug(
        //   "getManufacturingCostTemplateId",
        //   getManufacturingCostTemplateId
        // );

        timeToBomRevision = manufacturingCostTemplate(
          setupTimeInHours,
          runRateInHours,
          getManufacturingCostTemplateId
        );

        finalTimeCalculation.push(timeToBomRevision);
      }

      //log.debug("finalTimeCalculation", finalTimeCalculation);

      let totalTimeCalculation = 0;

      for (let i = 0; i < finalTimeCalculation.length; i++) {
        for (let j = 0; j < finalTimeCalculation[i].length; j++) {
          totalTimeCalculation =
            totalTimeCalculation + finalTimeCalculation[i][j];
        }
      }

      //log.debug("totalTimeCalculation", totalTimeCalculation);

      return totalTimeCalculation;
    } catch (err) {
      log.debug({
        title: "err in manufacturingRouting() function",
        details: err.toString()
      });
    }
  }

  /**
   * @date 2022-05-08
   * @param   {any} setupTimeInHours
   * @param   {any} getRunRate
   * @param   {any} getManufacturingCostTemplateId
   * @returns {any}
   */
  function manufacturingCostTemplate(
    setupTimeInHours,
    getRunRate,
    getManufacturingCostTemplateId
  ) {
    try {
      let finalSetupTimeArr = [];
      let finalRunRateArr = [];
      let finalTimeArr = [];

      let loadManufacturingCostTemplate = record.load({
        type: "manufacturingcosttemplate",
        id: getManufacturingCostTemplateId
      });

      let getCostCount = loadManufacturingCostTemplate.getLineCount({
        sublistId: "costdetail"
      });

      for (let m = 0; m < getCostCount; m++) {
        let getFixedRate = loadManufacturingCostTemplate.getSublistValue({
          sublistId: "costdetail",
          fieldId: "fixedrate",
          line: m
        });

        //log.debug("getFixedRate", getFixedRate);

        let getRunRateTemp = loadManufacturingCostTemplate.getSublistValue({
          sublistId: "costdetail",
          fieldId: "runrate",
          line: m
        });

        // log.debug("getRunRateTemp", getRunRateTemp);

        if (getFixedRate) {
          let finalSetupTime = setupTimeInHours * getFixedRate;

          //    log.debug("finalSetupTime", finalSetupTime);

          finalSetupTimeArr.push(finalSetupTime);
        } else {
          let finalRunTime = getRunRate * getRunRateTemp;

          // log.debug("finalRunTime", finalRunTime);

          finalRunRateArr.push(finalRunTime);
        }

        // log.debug("finalSetupTimeArr", finalSetupTimeArr);
        // log.debug("finalRunRateArr", finalRunRateArr);
      }

      finalTimeArr = finalSetupTimeArr.concat(finalRunRateArr);

      return finalTimeArr;
    } catch (err) {
      log.debug({
        title: "err in manufacturingCostTemplate() function",
        details: err.toString()
      });
    }
  }

  /**
   * @date 2022-05-08
   * @function {}            - Calls this suitelet for every current revision BOM Caculation Amount
   * @param   {number} recId - BOM Current Revision Record ID
   * @returns {number}       - The totalAmount sum for the Current Revision Record ID
   */
  function callSuitelet(recId) {
    let suiteletURL = url.resolveScript({
      scriptId: "customscript_apm_sl_costcalcualtion",
      deploymentId: "customdeploy_apm_sl_costcalcualtion",
      params: {
        recId: recId
      },
      returnExternalUrl: true
    });

    //suiteletURL = "https://3809900.app.netsuite.com" + "" + suiteletURL;
    //log.debug("suiteletURL", suiteletURL);

    let response = https.get({
      url: suiteletURL
    });
    //log.debug("response.body", response.body);

    if (_logValidation(response)) {
      response = JSON.parse(response.body);
    }
    //log.debug("response", response);
    //log.debug("type response", typeof response);

    return response;
  }

  /**
   * @date 2022-05-08
   * @param {any} value
   * @returns {any}
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

  return {onRequest: costCalculation};
});
