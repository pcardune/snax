(module
 (type $f32_=>_f32 (func (param f32) (result f32)))
 (type $f32_f32_f32_f32_i32_=>_none (func (param f32 f32 f32 f32 i32)))
 (type $none_=>_none (func))
 (type $i32_i32_i32_=>_none (func (param i32 i32 i32)))
 (import "console" "draw" (func $<draw>f0 (param i32 i32 i32)))
 (global $g0:#SP (mut i32) (i32.const 0))
 (memory $0 100 100)
 (export "clifford" (func $<clifford>f1))
 (export "_start" (func $_start))
 (export "stackPointer" (global $g0:#SP))
 (export "memory" (memory $0))
 (func $<clifford>f1 (; has Stack IR ;) (param $0 f32) (param $1 f32) (param $2 f32) (param $3 f32) (param $4 i32)
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
  ;;@ clifford.snx:11:3
  (local.set $11
   ;;@ clifford.snx:11:15
   (i32.const 1000)
  )
  ;;@ clifford.snx:12:3
  (local.set $12
   ;;@ clifford.snx:12:16
   (i32.const 1000)
  )
  ;;@ clifford.snx:14:3
  (memory.fill
   (local.tee $5
    (global.get $g0:#SP)
   )
   (i32.const 0)
   (i32.const 4000000)
  )
  ;;@ clifford.snx:16:3
  (local.set $16
   ;;@ clifford.snx:16:15
   (i32.div_s
    (local.get $4)
    ;;@ clifford.snx:16:26
    (i32.const 50000)
   )
  )
  ;;@ clifford.snx:18:3
  (loop $while_0
   (local.set $7
    (call $<sinf32>f3
     ;;@ clifford.snx:20:17
     (f32.mul
      (local.get $0)
      ;;@ clifford.snx:20:19
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
     ;;@ clifford.snx:20:25
     (block (result f32)
      (local.set $7
       (call $<cosf32>f2
        ;;@ clifford.snx:20:34
        (f32.mul
         (local.get $0)
         ;;@ clifford.snx:20:36
         (local.get $8)
        )
       )
      )
      (global.set $g0:#SP
       (local.get $5)
      )
      (f32.mul
       ;;@ clifford.snx:20:25
       (local.get $2)
       (local.get $7)
      )
     )
    )
   )
   (local.set $8
    (call $<sinf32>f3
     ;;@ clifford.snx:21:17
     (f32.mul
      (local.get $1)
      ;;@ clifford.snx:21:19
      (local.get $8)
     )
    )
   )
   (global.set $g0:#SP
    (local.get $5)
   )
   (local.set $6
    (call $<cosf32>f2
     ;;@ clifford.snx:21:34
     (f32.mul
      (local.get $1)
      ;;@ clifford.snx:21:36
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
      ;;@ clifford.snx:21:25
      (local.get $3)
      (local.get $6)
     )
    )
   )
   ;;@ clifford.snx:25:5
   (if
    (i32.and
     ;;@ clifford.snx:25:9
     (i32.lt_s
      (local.tee $14
       ;;@ clifford.snx:23:14
       (i32.trunc_f32_s
        ;;@ clifford.snx:23:31
        (f32.mul
         ;;@ clifford.snx:23:32
         (f32.add
          (local.get $7)
          ;;@ clifford.snx:23:37
          (f32.const 1.5)
         )
         (f32.const 270)
        )
       )
      )
      ;;@ clifford.snx:25:14
      (local.get $11)
     )
     ;;@ clifford.snx:25:23
     (i32.lt_s
      (local.tee $15
       ;;@ clifford.snx:24:14
       (i32.trunc_f32_s
        ;;@ clifford.snx:24:31
        (f32.mul
         ;;@ clifford.snx:24:32
         (f32.add
          (local.get $6)
          ;;@ clifford.snx:24:37
          (f32.const 1.5)
         )
         (f32.const 270)
        )
       )
      )
      ;;@ clifford.snx:25:28
      (local.get $12)
     )
    )
    ;;@ clifford.snx:26:7
    (if
     (i32.lt_u
      ;;@ clifford.snx:27:11
      (local.tee $9
       ;;@ clifford.snx:26:19
       (i32.load8_u
        (i32.add
         (i32.add
          (i32.add
           (local.get $5)
           (i32.mul
            ;;@ clifford.snx:26:26
            (local.get $15)
            (i32.const 4000)
           )
          )
          (i32.shl
           ;;@ clifford.snx:26:30
           (local.get $14)
           (i32.const 2)
          )
         )
         ;;@ clifford.snx:26:34
         (i32.const 3)
        )
       )
      )
      ;;@ clifford.snx:27:19
      (i32.const 255)
     )
     ;;@ clifford.snx:28:9
     (block
      ;;@ clifford.snx:29:9
      (if
       (i32.gt_s
        ;;@ clifford.snx:29:13
        (local.tee $10
         (i32.add
          ;;@ clifford.snx:28:17
          (local.get $9)
          ;;@ clifford.snx:28:25
          (local.get $16)
         )
        )
        ;;@ clifford.snx:29:21
        (i32.const 255)
       )
       ;;@ clifford.snx:30:11
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
            ;;@ clifford.snx:32:16
            (local.get $15)
            (i32.const 4000)
           )
          )
          (i32.shl
           ;;@ clifford.snx:32:20
           (local.get $14)
           (i32.const 2)
          )
         )
         ;;@ clifford.snx:32:24
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
   ;;@ clifford.snx:36:5
   (local.set $8
    (local.get $7)
   )
   (br_if $while_0
    (i32.lt_s
     ;;@ clifford.snx:18:10
     (local.tee $13
      (i32.add
       ;;@ clifford.snx:39:9
       (local.get $13)
       ;;@ clifford.snx:39:11
       (i32.const 1)
      )
     )
     ;;@ clifford.snx:18:14
     (local.get $4)
    )
   )
  )
  (call $<draw>f0
   ;;@ clifford.snx:41:8
   (local.get $5)
   ;;@ clifford.snx:41:17
   (local.get $11)
   ;;@ clifford.snx:41:24
   (local.get $12)
  )
  (global.set $g0:#SP
   (local.get $5)
  )
 )
 (func $<cosf32>f2 (; has Stack IR ;) (param $0 f32) (result f32)
  (local $1 f32)
  (local $2 i32)
  (local $3 i32)
  (local $4 f32)
  (local $5 f32)
  (local $6 i32)
  (local $7 i32)
  ;;@ clifford.snx:46:3
  (local.set $7
   ;;@ clifford.snx:46:11
   (i32.const 8)
  )
  ;;@ clifford.snx:48:3
  (local.set $2
   ;;@ clifford.snx:48:14
   (i32.const -1)
  )
  ;;@ clifford.snx:50:3
  (local.set $3
   ;;@ clifford.snx:50:11
   (i32.const 2)
  )
  ;;@ clifford.snx:51:3
  (loop $while_2
   ;;@ clifford.snx:52:5
   (local.set $4
    ;;@ clifford.snx:52:17
    (f32.const 1)
   )
   ;;@ clifford.snx:53:5
   (local.set $5
    ;;@ clifford.snx:53:16
    (f32.const 1)
   )
   ;;@ clifford.snx:54:5
   (local.set $6
    ;;@ clifford.snx:54:13
    (i32.const 1)
   )
   ;;@ clifford.snx:55:5
   (loop $while_1
    ;;@ clifford.snx:56:7
    (local.set $4
     (f32.mul
      ;;@ clifford.snx:56:11
      (local.get $4)
      ;;@ clifford.snx:56:15
      (local.get $0)
     )
    )
    ;;@ clifford.snx:57:7
    (local.set $5
     (f32.mul
      ;;@ clifford.snx:57:14
      (local.get $5)
      (f32.convert_i32_s
       ;;@ clifford.snx:57:21
       (local.get $6)
      )
     )
    )
    (br_if $while_1
     (i32.lt_s
      ;;@ clifford.snx:55:12
      (local.tee $6
       (i32.add
        ;;@ clifford.snx:58:11
        (local.get $6)
        ;;@ clifford.snx:58:13
        (i32.const 1)
       )
      )
      ;;@ clifford.snx:55:16
      (i32.add
       (local.get $3)
       ;;@ clifford.snx:55:18
       (i32.const 1)
      )
     )
    )
   )
   ;;@ clifford.snx:61:5
   (local.set $1
    (f32.add
     ;;@ clifford.snx:61:11
     (local.get $1)
     ;;@ clifford.snx:61:17
     (f32.div
      (f32.mul
       (f32.convert_i32_s
        (local.get $2)
       )
       ;;@ clifford.snx:61:24
       (local.get $4)
      )
      ;;@ clifford.snx:61:28
      (local.get $5)
     )
    )
   )
   ;;@ clifford.snx:62:5
   (local.set $2
    (i32.sub
     (i32.const 0)
     ;;@ clifford.snx:62:13
     (local.get $2)
    )
   )
   (br_if $while_2
    (i32.lt_s
     ;;@ clifford.snx:51:10
     (local.tee $3
      (i32.add
       ;;@ clifford.snx:63:9
       (local.get $3)
       ;;@ clifford.snx:63:11
       (i32.const 2)
      )
     )
     ;;@ clifford.snx:51:14
     (i32.add
      (local.get $7)
      ;;@ clifford.snx:51:16
      (i32.const 1)
     )
    )
   )
  )
  ;;@ clifford.snx:65:10
  (f32.add
   ;;@ clifford.snx:65:12
   (local.get $1)
   (f32.const 1)
  )
 )
 (func $<sinf32>f3 (; has Stack IR ;) (param $0 f32) (result f32)
  (local $1 f32)
  (local $2 i32)
  (local $3 f32)
  (local $4 f32)
  (local $5 i32)
  (local $6 i32)
  (local $7 i32)
  ;;@ clifford.snx:70:3
  (local.set $7
   ;;@ clifford.snx:70:11
   (i32.const 8)
  )
  ;;@ clifford.snx:72:3
  (local.set $6
   ;;@ clifford.snx:72:14
   (i32.const -1)
  )
  ;;@ clifford.snx:74:3
  (local.set $2
   ;;@ clifford.snx:74:11
   (i32.const 1)
  )
  ;;@ clifford.snx:75:3
  (loop $while_4
   ;;@ clifford.snx:76:5
   (local.set $3
    ;;@ clifford.snx:76:17
    (f32.const 1)
   )
   ;;@ clifford.snx:77:5
   (local.set $4
    ;;@ clifford.snx:77:16
    (f32.const 1)
   )
   ;;@ clifford.snx:78:5
   (local.set $5
    ;;@ clifford.snx:78:13
    (i32.const 1)
   )
   ;;@ clifford.snx:79:5
   (loop $while_3
    ;;@ clifford.snx:80:7
    (local.set $3
     (f32.mul
      ;;@ clifford.snx:80:11
      (local.get $3)
      ;;@ clifford.snx:80:15
      (local.get $0)
     )
    )
    ;;@ clifford.snx:81:7
    (local.set $4
     (f32.mul
      ;;@ clifford.snx:81:14
      (local.get $4)
      (f32.convert_i32_s
       ;;@ clifford.snx:81:21
       (local.get $5)
      )
     )
    )
    (br_if $while_3
     (i32.lt_s
      ;;@ clifford.snx:79:12
      (local.tee $5
       (i32.add
        ;;@ clifford.snx:82:11
        (local.get $5)
        ;;@ clifford.snx:82:13
        (i32.const 1)
       )
      )
      ;;@ clifford.snx:79:16
      (i32.add
       (local.get $2)
       ;;@ clifford.snx:79:18
       (i32.const 1)
      )
     )
    )
   )
   ;;@ clifford.snx:86:5
   (local.set $1
    (f32.add
     ;;@ clifford.snx:86:11
     (local.get $1)
     ;;@ clifford.snx:86:17
     (f32.div
      (f32.mul
       (f32.convert_i32_s
        (local.tee $6
         (i32.sub
          (i32.const 0)
          ;;@ clifford.snx:85:13
          (local.get $6)
         )
        )
       )
       ;;@ clifford.snx:86:24
       (local.get $3)
      )
      ;;@ clifford.snx:86:28
      (local.get $4)
     )
    )
   )
   (br_if $while_4
    (i32.lt_s
     ;;@ clifford.snx:75:10
     (local.tee $2
      (i32.add
       ;;@ clifford.snx:87:9
       (local.get $2)
       ;;@ clifford.snx:87:11
       (i32.const 2)
      )
     )
     ;;@ clifford.snx:75:14
     (i32.add
      (local.get $7)
      ;;@ clifford.snx:75:16
      (i32.const 1)
     )
    )
   )
  )
  ;;@ clifford.snx:89:10
  (local.get $1)
 )
 (func $_start (; has Stack IR ;)
  (global.set $g0:#SP
   (i32.const 6553600)
  )
 )
)
