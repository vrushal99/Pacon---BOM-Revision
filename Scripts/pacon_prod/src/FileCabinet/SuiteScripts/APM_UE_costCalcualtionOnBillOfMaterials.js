

/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */

 define([], function(){


    function beforeLoad(context){
    
    try{

        log.debug('context.type',context.type);

        if(context.type == 'view' || context.type == 'edit'){

         var currentForm = context.form;
    
         currentForm.clientScriptFileId = 7583;
    
         currentForm.addButton({
         id: 'custpage_cost_calculation',
         label: 'Cost Calculation',
         functionName: 'CallforSuitelet()'
        });
    }
    
     return true;
    } 
    catch(e){

        log.debug({
            title: 'Error in afterSubmit() function',
            details: e.toString()
        });

    }
}
    
    return{
    
        beforeLoad : beforeLoad
    }
    
        
    })
    