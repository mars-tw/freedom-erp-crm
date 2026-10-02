import {createHash} from 'node:crypto';
export class Problem extends Error { constructor(public status:number,public code:string,message:string){super(message);} }
export function ok(value:unknown,status:number,code:string,message:string):asserts value {if(!value)throw new Problem(status,code,message);}
export function digest(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
