import { draw } from 'console';

  var bufferView;

  var scratchBuffer = new ArrayBuffer(16);
  var i32ScratchView = new Int32Array(scratchBuffer);
  var f32ScratchView = new Float32Array(scratchBuffer);
  var f64ScratchView = new Float64Array(scratchBuffer);
  
  function wasm2js_memory_fill(dest, value, size) {
    dest = dest >>> 0;
    size = size >>> 0;
    if (dest + size > bufferView.length) throw "trap: invalid memory.fill";
    bufferView.fill(value, dest, dest + size);
  }
      
function asmFunc(env) {
 var buffer = new ArrayBuffer(6553600);
 var HEAP8 = new Int8Array(buffer);
 var HEAP16 = new Int16Array(buffer);
 var HEAP32 = new Int32Array(buffer);
 var HEAPU8 = new Uint8Array(buffer);
 var HEAPU16 = new Uint16Array(buffer);
 var HEAPU32 = new Uint32Array(buffer);
 var HEAPF32 = new Float32Array(buffer);
 var HEAPF64 = new Float64Array(buffer);
 var Math_imul = Math.imul;
 var Math_fround = Math.fround;
 var Math_abs = Math.abs;
 var Math_clz32 = Math.clz32;
 var Math_min = Math.min;
 var Math_max = Math.max;
 var Math_floor = Math.floor;
 var Math_ceil = Math.ceil;
 var Math_trunc = Math.trunc;
 var Math_sqrt = Math.sqrt;
 var abort = env.abort;
 var nan = NaN;
 var infinity = Infinity;
 var $draw_f3 = env.draw;
 var g0__SP = 0;
 function $math__sinf32_f0($0) {
  var $1 = Math_fround(0), $2 = Math_fround(0), $3 = Math_fround(0);
  $1 = Math_fround(1.0);
  if ($0 < Math_fround(0.0)) {
   $1 = Math_fround(-1.0);
   $0 = Math_fround(Math_abs($0));
  }
  $2 = $math__modf32_f2($0, Math_fround(6.2831854820251465));
  g0__SP = 0;
  $0 = $math__modf32_f2($2, Math_fround(3.1415927410125732));
  g0__SP = 0;
  $3 = Math_fround(Math_fround(3.1415927410125732) - $0);
  return Math_fround(Math_fround(Math_fround(Math_fround($0 * Math_fround(16.0)) * $3) / Math_fround(Math_fround(49.3480224609375) - Math_fround(Math_fround($0 * Math_fround(4.0)) * $3))) * ($2 > Math_fround(3.1415927410125732) ? Math_fround(-$1) : $1));
 }
 
 function $math__cosf32_f1($0) {
  $0 = $math__sinf32_f0(Math_fround($0 + Math_fround(1.5707963705062866)));
  g0__SP = 0;
  return $0;
 }
 
 function $math__modf32_f2($0, $1) {
  return Math_fround($0 - Math_fround(Math_fround(Math_trunc(Math_fround($0 / $1))) * $1));
 }
 
 function $clifford_f4($0, $1, $2, $3, $4) {
  $0 = Math_fround($0);
  $1 = Math_fround($1);
  $2 = Math_fround($2);
  $3 = Math_fround($3);
  $4 = $4 | 0;
  var $5 = 0, $6 = 0, $7 = Math_fround(0), $8 = 0, $9 = Math_fround(0), $10 = 0, $11 = 0, $12 = 0, $13 = Math_fround(0), $14 = Math_fround(0), $15 = Math_fround(0);
  g0__SP = g0__SP - 4e6 | 0;
  $5 = g0__SP;
  wasm2js_memory_fill($5, 0, 4e6);
  $12 = ($4 | 0) / (5e4 | 0) | 0;
  while_0 : while (1) {
   $13 = $math__sinf32_f0(Math_fround($0 * $7));
   g0__SP = $5;
   $14 = $math__cosf32_f1(Math_fround($0 * $9));
   g0__SP = $5;
   $15 = $math__sinf32_f0(Math_fround($1 * $9));
   g0__SP = $5;
   $7 = $math__cosf32_f1(Math_fround($1 * $7));
   g0__SP = $5;
   $9 = Math_fround($13 + Math_fround($2 * $14));
   $8 = ~~Math_fround(Math_fround($9 + Math_fround(1.5)) * Math_fround(270.0));
   $7 = Math_fround($15 + Math_fround($3 * $7));
   $10 = ~~Math_fround(Math_fround($7 + Math_fround(1.5)) * Math_fround(270.0));
   if (($8 | 0) < (1e3 | 0) & ($10 | 0) < (1e3 | 0) | 0) {
    $6 = HEAPU8[(((Math_imul($10, 4e3) + $5 | 0) + ($8 << 2 | 0) | 0) + 3 | 0) >> 0];
    if ($6 >>> 0 < 255 >>> 0) {
     $8 = ((Math_imul($10, 4e3) + $5 | 0) + ($8 << 2 | 0) | 0) + 3 | 0;
     $6 = $6 + $12 | 0;
     if (($6 | 0) > (255 | 0)) {
      $6 = 255
     }
     HEAP8[$8 >> 0] = $6;
    }
   }
   $11 = $11 + 1 | 0;
   if (($11 | 0) < ($4 | 0)) {
    continue while_0
   }
   break while_0;
  };
  $draw_f3($5 | 0, 1e3 | 0, 1e3 | 0);
  g0__SP = $5;
 }
 
 function _start() {
  g0__SP = 6553600;
  return 1 | 0;
 }
 
 bufferView = HEAPU8;
 function __wasm_memory_size() {
  return buffer.byteLength / 65536 | 0;
 }
 
 return {
  "clifford": $clifford_f4, 
  "_start": _start, 
  "stackPointer": g0__SP, 
  "memory": Object.create(Object.prototype, {
   "grow": {
    
   }, 
   "buffer": {
    "get": function () {
     return buffer;
    }
    
   }
  })
 };
}

var retasmFunc = asmFunc(  { abort: function() { throw new Error('abort'); },
    draw
  });
export var clifford = retasmFunc.clifford;
export var _start = retasmFunc._start;
export var memory = retasmFunc.memory;
