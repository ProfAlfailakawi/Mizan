import React, { useMemo } from 'react';

// Small dependency-free QR Model 2 encoder for short MIZAN pass payloads.
// It emits Version 4 / Error Correction L / byte mode (up to 78 UTF-8 bytes).
// The implementation follows ISO/IEC 18004 layout, BCH format information and
// Reed-Solomon ECC over GF(256). It is intentionally scoped to operational pass IDs.

const VERSION=4;
const SIZE=33;
const DATA_CODEWORDS=80;
const ECC_CODEWORDS=20;
const FORMAT_XOR=0x5412;
const FORMAT_POLY=0x537;

const gfExp=new Array<number>(512).fill(0);
const gfLog=new Array<number>(256).fill(0);
(function initGalois(){let x=1;for(let i=0;i<255;i++){gfExp[i]=x;gfLog[x]=i;x<<=1;if(x&0x100)x^=0x11d;}for(let i=255;i<512;i++)gfExp[i]=gfExp[i-255];})();
const gfMul=(a:number,b:number)=>a===0||b===0?0:gfExp[gfLog[a]+gfLog[b]];

function generatorPolynomial(degree:number){let poly=[1];for(let i=0;i<degree;i++){const next=new Array(poly.length+1).fill(0);for(let j=0;j<poly.length;j++){next[j]^=poly[j];next[j+1]^=gfMul(poly[j],gfExp[i]);}poly=next;}return poly;}
function reedSolomon(data:number[],degree:number){const gen=generatorPolynomial(degree);const rem=new Array(degree).fill(0);for(const byte of data){const factor=byte^rem[0];rem.shift();rem.push(0);for(let i=0;i<degree;i++)rem[i]^=gfMul(gen[i+1],factor);}return rem;}
function bitLength(n:number){let d=0;while(n){d++;n>>>=1;}return d;}
function bchFormat(data:number){let d=data<<10;while(bitLength(d)-bitLength(FORMAT_POLY)>=0)d^=FORMAT_POLY<<(bitLength(d)-bitLength(FORMAT_POLY));return ((data<<10)|d)^FORMAT_XOR;}

function encodeData(text:string){const bytes=Array.from(new TextEncoder().encode(text));if(bytes.length>78)throw new Error('MIZAN pass payload exceeds QR v4-L capacity');const bits:number[]=[];const push=(value:number,count:number)=>{for(let i=count-1;i>=0;i--)bits.push((value>>>i)&1)};push(0b0100,4);push(bytes.length,8);bytes.forEach(b=>push(b,8));const maxBits=DATA_CODEWORDS*8;for(let i=0;i<4&&bits.length<maxBits;i++)bits.push(0);while(bits.length%8)bits.push(0);const out:number[]=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|(bits[i+j]||0);out.push(b);}let pad=true;while(out.length<DATA_CODEWORDS){out.push(pad?0xec:0x11);pad=!pad;}return [...out,...reedSolomon(out,ECC_CODEWORDS)];}

type Cell=boolean|null;
function mask0(row:number,col:number){return (row+col)%2===0;}
export function createQrMatrix(text:string){
 const modules:Cell[][]=Array.from({length:SIZE},()=>Array<Cell>(SIZE).fill(null));
 const finder=(row:number,col:number)=>{for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){const rr=row+r,cc=col+c;if(rr<0||rr>=SIZE||cc<0||cc>=SIZE)continue;const dark=r>=0&&r<=6&&c>=0&&c<=6&&(r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4));modules[rr][cc]=dark;}};
 finder(0,0);finder(SIZE-7,0);finder(0,SIZE-7);
 for(let r=8;r<SIZE-8;r++)if(modules[r][6]===null)modules[r][6]=r%2===0;
 for(let c=8;c<SIZE-8;c++)if(modules[6][c]===null)modules[6][c]=c%2===0;
 const alignment=(row:number,col:number)=>{if(modules[row][col]!==null)return;for(let r=-2;r<=2;r++)for(let c=-2;c<=2;c++)modules[row+r][col+c]=Math.max(Math.abs(r),Math.abs(c))!==1;};
 alignment(26,26);
 // Reserve and write 15-bit format information: EC level L (01), mask 0.
 const format=bchFormat((0b01<<3)|0);
 for(let i=0;i<15;i++){
  const dark=((format>>>i)&1)===1;
  if(i<6)modules[i][8]=dark;else if(i<8)modules[i+1][8]=dark;else modules[SIZE-15+i][8]=dark;
  if(i<8)modules[8][SIZE-i-1]=dark;else if(i<9)modules[8][15-i]=dark;else modules[8][15-i-1]=dark;
 }
 modules[SIZE-8][8]=true;
 const stream=encodeData(text);let byteIndex=0,bitIndex=7,row=SIZE-1,inc=-1;
 for(let col=SIZE-1;col>0;col-=2){if(col===6)col--;while(true){for(let c=0;c<2;c++){const cc=col-c;if(modules[row][cc]!==null)continue;let dark=false;if(byteIndex<stream.length)dark=((stream[byteIndex]>>>bitIndex)&1)===1;if(mask0(row,cc))dark=!dark;modules[row][cc]=dark;bitIndex--;if(bitIndex<0){byteIndex++;bitIndex=7;}}row+=inc;if(row<0||row>=SIZE){row-=inc;inc=-inc;break;}}}
 return modules.map(r=>r.map(v=>Boolean(v)));
}

export const RealQRCode:React.FC<{value:string;size?:number;label?:string;className?:string}>=({value,size=160,label='رمز مرور ميزان',className=''})=>{
 const matrix=useMemo(()=>createQrMatrix(value),[value]);const quiet=4;const total=SIZE+quiet*2;const path=useMemo(()=>{const parts:string[]=[];matrix.forEach((row,r)=>row.forEach((dark,c)=>{if(dark)parts.push(`M${c+quiet} ${r+quiet}h1v1h-1z`)}));return parts.join('');},[matrix]);
 return <svg className={className} width={size} height={size} viewBox={`0 0 ${total} ${total}`} role="img" aria-label={label} shapeRendering="crispEdges"><rect width={total} height={total} fill="#fffefb"/><path d={path} fill="#17221e"/></svg>;
};

export const makeMizanPassPayload=(participantCode:string)=>`MZ1|${participantCode.trim()}`;
export const parseMizanPassPayload=(raw:string)=>{const v=raw.trim();return v.startsWith('MZ1|')?v.slice(4).trim():v;};
