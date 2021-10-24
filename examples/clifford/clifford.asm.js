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
 var $draw_f0 = env.draw;
 var g0__SP = 0;
 function $clifford_f1($0, $1, $2, $3, $4) {
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
   $13 = $sinf32_f3(Math_fround($0 * $7));
   g0__SP = $5;
   $14 = $cosf32_f2(Math_fround($0 * $9));
   g0__SP = $5;
   $15 = $sinf32_f3(Math_fround($1 * $9));
   g0__SP = $5;
   $7 = $cosf32_f2(Math_fround($1 * $7));
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
  $draw_f0($5 | 0, 1e3 | 0, 1e3 | 0);
  g0__SP = $5;
 }
 
 function $cosf32_f2($0) {
  var $1 = 0, $2 = 0, $3 = 0, $4 = Math_fround(0), $5 = Math_fround(0), $6 = Math_fround(0);
  $3 = -1;
  $1 = 2;
  while_2 : while (1) {
   $4 = Math_fround(1.0);
   $5 = Math_fround(1.0);
   $2 = 1;
   while_1 : while (1) {
    $4 = Math_fround($4 * $0);
    $5 = Math_fround($5 * Math_fround($2 | 0));
    $2 = $2 + 1 | 0;
    if (($2 | 0) < ($1 + 1 | 0 | 0)) {
     continue while_1
    }
    break while_1;
   };
   $6 = Math_fround($6 + Math_fround(Math_fround(Math_fround($3 | 0) * $4) / $5));
   $3 = 0 - $3 | 0;
   $1 = $1 + 2 | 0;
   if (($1 | 0) < (9 | 0)) {
    continue while_2
   }
   break while_2;
  };
  return Math_fround($6 + Math_fround(1.0));
 }
 
 function $sinf32_f3($0) {
  var $1 = 0, $2 = 0, $3 = 0, $4 = Math_fround(0), $5 = Math_fround(0), $6 = Math_fround(0);
  $3 = -1;
  $1 = 1;
  while_4 : while (1) {
   $4 = Math_fround(1.0);
   $5 = Math_fround(1.0);
   $2 = 1;
   while_3 : while (1) {
    $4 = Math_fround($4 * $0);
    $5 = Math_fround($5 * Math_fround($2 | 0));
    $2 = $2 + 1 | 0;
    if (($2 | 0) < ($1 + 1 | 0 | 0)) {
     continue while_3
    }
    break while_3;
   };
   $3 = 0 - $3 | 0;
   $6 = Math_fround($6 + Math_fround(Math_fround(Math_fround($3 | 0) * $4) / $5));
   $1 = $1 + 2 | 0;
   if (($1 | 0) < (9 | 0)) {
    continue while_4
   }
   break while_4;
  };
  return $6;
 }
 
 function _start() {
  g0__SP = 6553600;
 }
 
 bufferView = HEAPU8;
 function __wasm_memory_size() {
  return buffer.byteLength / 65536 | 0;
 }
 
 return {
  "clifford": $clifford_f1, 
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
