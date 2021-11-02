(module
 (type $f32_=>_f32 (func (param f32) (result f32)))
 (type $f32_f32_=>_f32 (func (param f32 f32) (result f32)))
 (type $f32_f32_f32_f32_i32_=>_none (func (param f32 f32 f32 f32 i32)))
 (type $none_=>_i32 (func (result i32)))
 (type $i32_i32_i32_=>_none (func (param i32 i32 i32)))
 (import "console" "draw" (func $<draw>f3 (param i32 i32 i32)))
 (global $g0:#SP (mut i32) (i32.const 0))
 (memory $0 100 100)
 (export "clifford" (func $<clifford>f4))
 (export "_start" (func $_start))
 (export "stackPointer" (global $g0:#SP))
 (export "memory" (memory $0))
 (func $<math::sinf32>f0 (; has Stack IR ;) (param $0 f32) (result f32)
  (local $1 f32)
  (local $2 f32)
  ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:4:3
  (local.set $2
   ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:4:14
   (f32.const 1)
  )
  (local.set $1
   (call $<math::modf32>f2
    ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:12:3
    (if (result f32)
     (f32.lt
      ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:12:7
      (local.get $0)
      ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:12:11
      (f32.const 0)
     )
     ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:13:5
     (block (result f32)
      ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:14:5
      (local.set $2
       (f32.const -1)
      )
      (f32.abs
       ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:13:18
       (local.get $0)
      )
     )
     (local.get $0)
    )
    ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:18:17
    (f32.mul
     (local.tee $0
      ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:3:12
      (f32.const 3.1415927410125732)
     )
     (f32.const 2)
    )
   )
  )
  (global.set $g0:#SP
   (i32.const 0)
  )
  ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:23:5
  (local.set $2
   ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:22:3
   (select
    (f32.neg
     ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:23:13
     (local.get $2)
    )
    (local.get $2)
    (f32.lt
     ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:22:11
     (local.get $0)
     ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:22:7
     (local.get $1)
    )
   )
  )
  (local.set $1
   (call $<math::modf32>f2
    ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:25:14
    (local.get $1)
    ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:25:17
    (local.get $0)
   )
  )
  (global.set $g0:#SP
   (i32.const 0)
  )
  (f32.mul
   (f32.div
    (f32.mul
     (f32.mul
      (local.get $1)
      ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:31:17
      (f32.const 16)
     )
     ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:31:25
     (local.tee $0
      (f32.sub
       (local.get $0)
       ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:31:28
       (local.get $1)
      )
     )
    )
    ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:31:32
    (f32.sub
     (f32.const 49.3480224609375)
     ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:31:43
     (f32.mul
      (f32.mul
       ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:31:47
       (local.get $1)
       ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:31:43
       (f32.const 4)
      )
      ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:31:50
      (local.get $0)
     )
    )
   )
   ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:34:20
   (local.get $2)
  )
 )
 (func $<math::cosf32>f1 (; has Stack IR ;) (param $0 f32) (result f32)
  (local.set $0
   (call $<math::sinf32>f0
    ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:38:17
    (f32.add
     (local.get $0)
     ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:38:19
     (f32.const 1.5707963705062866)
    )
   )
  )
  (global.set $g0:#SP
   (i32.const 0)
  )
  (local.get $0)
 )
 (func $<math::modf32>f2 (; has Stack IR ;) (param $0 f32) (param $1 f32) (result f32)
  ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:43:10
  (f32.sub
   (local.get $0)
   ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:43:14
   (f32.mul
    (f32.trunc
     ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:43:25
     (f32.div
      (local.get $0)
      ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:43:27
      (local.get $1)
     )
    )
    ;;@ /home/pcardune/programming/pcardune/snax/snax/stdlib/snax/math.snx:43:32
    (local.get $1)
   )
  )
 )
 (func $<clifford>f4 (; has Stack IR ;) (param $0 f32) (param $1 f32) (param $2 f32) (param $3 f32) (param $4 i32)
  (local $5 i32)
  (local $6 f32)
  (local $7 f32)
  (local $8 f32)
  (local $9 i32)
  (local $10 i32)
  (local $11 i32)
  (local $12 i32)
  (local $13 i32)
  (local $14 i32)
  (local $15 i32)
  (local $16 i32)
  (global.set $g0:#SP
   (i32.sub
    (global.get $g0:#SP)
    (i32.const 4000000)
   )
  )
  ;;@ clifford.snx:13:3
  (local.set $11
   ;;@ clifford.snx:13:15
   (i32.const 1000)
  )
  ;;@ clifford.snx:14:3
  (local.set $12
   ;;@ clifford.snx:14:16
   (i32.const 1000)
  )
  ;;@ clifford.snx:16:3
  (memory.fill
   (local.tee $5
    (global.get $g0:#SP)
   )
   (i32.const 0)
   (i32.const 4000000)
  )
  ;;@ clifford.snx:18:3
  (local.set $16
   ;;@ clifford.snx:18:15
   (i32.div_s
    (local.get $4)
    ;;@ clifford.snx:18:26
    (i32.const 50000)
   )
  )
  ;;@ clifford.snx:20:3
  (loop $while_0
   (local.set $7
    (call $<math::sinf32>f0
     ;;@ clifford.snx:22:23
     (f32.mul
      (local.get $0)
      ;;@ clifford.snx:22:25
      (local.get $6)
     )
    )
   )
   (global.set $g0:#SP
    (local.get $5)
   )
   (local.set $7
    (f32.add
     (local.get $7)
     ;;@ clifford.snx:22:31
     (block (result f32)
      (local.set $7
       (call $<math::cosf32>f1
        ;;@ clifford.snx:22:46
        (f32.mul
         (local.get $0)
         ;;@ clifford.snx:22:48
         (local.get $8)
        )
       )
      )
      (global.set $g0:#SP
       (local.get $5)
      )
      (f32.mul
       ;;@ clifford.snx:22:31
       (local.get $2)
       (local.get $7)
      )
     )
    )
   )
   (local.set $8
    (call $<math::sinf32>f0
     ;;@ clifford.snx:23:23
     (f32.mul
      (local.get $1)
      ;;@ clifford.snx:23:25
      (local.get $8)
     )
    )
   )
   (global.set $g0:#SP
    (local.get $5)
   )
   (local.set $6
    (call $<math::cosf32>f1
     ;;@ clifford.snx:23:46
     (f32.mul
      (local.get $1)
      ;;@ clifford.snx:23:48
      (local.get $6)
     )
    )
   )
   (global.set $g0:#SP
    (local.get $5)
   )
   (local.set $6
    (f32.add
     (local.get $8)
     (f32.mul
      ;;@ clifford.snx:23:31
      (local.get $3)
      (local.get $6)
     )
    )
   )
   ;;@ clifford.snx:27:5
   (if
    (i32.and
     ;;@ clifford.snx:27:9
     (i32.lt_s
      (local.tee $14
       ;;@ clifford.snx:25:14
       (i32.trunc_f32_s
        ;;@ clifford.snx:25:31
        (f32.mul
         ;;@ clifford.snx:25:32
         (f32.add
          (local.get $7)
          ;;@ clifford.snx:25:37
          (f32.const 1.5)
         )
         (f32.const 270)
        )
       )
      )
      ;;@ clifford.snx:27:14
      (local.get $11)
     )
     ;;@ clifford.snx:27:23
     (i32.lt_s
      (local.tee $15
       ;;@ clifford.snx:26:14
       (i32.trunc_f32_s
        ;;@ clifford.snx:26:31
        (f32.mul
         ;;@ clifford.snx:26:32
         (f32.add
          (local.get $6)
          ;;@ clifford.snx:26:37
          (f32.const 1.5)
         )
         (f32.const 270)
        )
       )
      )
      ;;@ clifford.snx:27:28
      (local.get $12)
     )
    )
    ;;@ clifford.snx:28:7
    (if
     (i32.lt_u
      ;;@ clifford.snx:29:11
      (local.tee $9
       ;;@ clifford.snx:28:19
       (i32.load8_u
        (i32.add
         (i32.add
          (i32.add
           (local.get $5)
           (i32.mul
            ;;@ clifford.snx:28:26
            (local.get $15)
            (i32.const 4000)
           )
          )
          (i32.shl
           ;;@ clifford.snx:28:30
           (local.get $14)
           (i32.const 2)
          )
         )
         ;;@ clifford.snx:28:34
         (i32.const 3)
        )
       )
      )
      ;;@ clifford.snx:29:19
      (i32.const 255)
     )
     ;;@ clifford.snx:30:9
     (block
      ;;@ clifford.snx:31:9
      (if
       (i32.gt_s
        ;;@ clifford.snx:31:13
        (local.tee $10
         (i32.add
          ;;@ clifford.snx:30:17
          (local.get $9)
          ;;@ clifford.snx:30:25
          (local.get $16)
         )
        )
        ;;@ clifford.snx:31:21
        (i32.const 255)
       )
       ;;@ clifford.snx:32:11
       (local.set $10
        (i32.const 255)
       )
      )
      (i32.store8
       (local.tee $9
        (i32.add
         (i32.add
          (i32.add
           (local.get $5)
           (i32.mul
            ;;@ clifford.snx:34:16
            (local.get $15)
            (i32.const 4000)
           )
          )
          (i32.shl
           ;;@ clifford.snx:34:20
           (local.get $14)
           (i32.const 2)
          )
         )
         ;;@ clifford.snx:34:24
         (i32.const 3)
        )
       )
       (local.get $10)
      )
      (drop
       (i32.load8_u
        (local.get $9)
       )
      )
     )
    )
   )
   ;;@ clifford.snx:38:5
   (local.set $8
    (local.get $7)
   )
   (br_if $while_0
    (i32.lt_s
     ;;@ clifford.snx:20:10
     (local.tee $13
      (i32.add
       ;;@ clifford.snx:41:9
       (local.get $13)
       ;;@ clifford.snx:41:11
       (i32.const 1)
      )
     )
     ;;@ clifford.snx:20:14
     (local.get $4)
    )
   )
  )
  (call $<draw>f3
   ;;@ clifford.snx:43:8
   (local.get $5)
   ;;@ clifford.snx:43:17
   (local.get $11)
   ;;@ clifford.snx:43:24
   (local.get $12)
  )
  (global.set $g0:#SP
   (local.get $5)
  )
 )
 (func $_start (; has Stack IR ;) (result i32)
  (global.set $g0:#SP
   (i32.const 6553600)
  )
  (i32.const 1)
 )
)
