/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */

define(["N/url", "N/currentRecord"], function (url, currentRecord) {
  function pageInit() {}

  function CallforSuitelet() {
    let record = currentRecord.get();
    let recId = record.id;
    let recType = record.type;

    let suiteletURL = url.resolveScript({
      scriptId: "customscript_apm_sl_costcalcualtion",
      deploymentId: "customdeploy_apm_sl_costcalcualtion",
      params: {
        recId: recId,
        recType: recType,
        main: true
      }
    });

    document.location = suiteletURL;

    window.open(suiteletURL, "_self", false);
  }

  return {
    CallforSuitelet: CallforSuitelet,
    pageInit: pageInit
  };
});
