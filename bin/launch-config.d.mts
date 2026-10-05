export interface LaunchCatalog {templates:readonly {id:string;modules:readonly string[];module_dependencies?:Record<string,string[]>}[];moduleDependencies?:Record<string,string[]>}
export interface LaunchConfig {format:'freedom-erp-launch-v1';industry:string;company_name:string;modules:string[];port:number|'auto';directory:string;auto_setup:boolean;simulation:true;real_finance:false}
export function normalizeLaunchConfig(value:unknown,catalog:LaunchCatalog):LaunchConfig;
