{{
  // eslint-ignore-file
  import * as AST from '../snax-ast.js';
  import * as specGen from '../spec-gen.js';
  function makeInteger(o:string[]) {
    return parseInt(o.join(""), 10);
  }
  function leftAssoc(
    rest:any[],
    val:any,
    func:(p:{operator:any, left:any, right:any})=>any,
    getVal=(last:any) => last[0],
  ):any {
    if (rest.length == 0) {
      return val; 
    }
    const last = rest.pop();
    return func({
      left: leftAssoc(rest, getVal(last), func, getVal),
      operator: last[last.length-2],
      right: val
    });
  }
  function rightAssoc(val:any, rest:any[], func:(p:{operator:any, left:any, right:any})=>any):any {
    if (rest.length == 0) {
      return val;
    }
    const first = rest.shift();
    return func({
      left:val,
      operator:first[0],
      right:rightAssoc(first[first.length-1], rest, func)
    });
  }
}}

{

  let spec:typeof specGen = {} as unknown as typeof specGen;

  if (options.includeLocations) {
    for (const key in specGen) {
      if (key.startsWith('make')) {
        (spec as any)[key] = (...args:any[]) => {
          const node = (specGen as any)[key](...args);
          node.location = location();
          return node;
        }
      } else {
        (spec as any)[key] = (specGen as any)[key];
      }
    }
  } else {
    spec = specGen;
  }

}

start
  = file
  / ws block:block ws { return block; }
  / statement
  / expr
  / ws { return spec.makeBlock([]); }

file "file"
  = ws statements:fileStatementList? ws {
    let decls = [];
    let mainFuncBody = [];
    let hasMainFunc = false;
    for (const statement of statements??[]) {
      if (spec.isFuncDecl(statement)) {
        if (statement.fields.symbol === "main") {
          hasMainFunc = true;
        }
        decls.push(statement);
      } else if (spec.isStatement(statement)) {
        mainFuncBody.push(statement);
      } else {
        decls.push(statement);
      }
    }
    if (mainFuncBody.length > 0) {
      let lastStatement = mainFuncBody[mainFuncBody.length-1];
      if (spec.isExprStatement(lastStatement)) {
        const returnStatement = spec.makeReturnStatement(
          lastStatement.fields.expr
        )
        returnStatement.location = lastStatement.fields.expr.location;
        mainFuncBody[mainFuncBody.length-1] = returnStatement;
      }
    }
    if (!hasMainFunc) {
      if (mainFuncBody.length > 0) {
        decls.push(
          spec.makeFuncDeclWith({
            symbol:'main',
            isPublic: false,
            parameters: spec.makeParameterList([]),
            body: spec.makeBlock(mainFuncBody)
          })
        );
      }
    } else if (mainFuncBody.length > 0 ) {
      throw new Error('Both free statements and a main function were provided. Choose one or the other');
    }
    return spec.makeFileWith({
      decls,
    });
  }

fileStatementList "file statements"
  = head:fileStatement tail:(ws fileStatement)* {
    return [head, ...tail.map((t:any)=>t[1])];
  }

fileStatement "file statement"
  = moduleStatement
  / statement

moduleDecl "module declaration"
  = "module" ws symbol:identifier ws "{" ws decls:moduleDeclList ws "}" {
    return spec.makeModuleDeclWith({symbol, decls});
  }

moduleDeclList "module declarations"
  = head:moduleStatement tail:(ws moduleStatement)* {
    return [head, ...tail.map((t:any)=>t[1])];
  }

moduleStatement "declaration"
  = "global" ws varDecl:varDecl ws ";" ws {
    return spec.makeGlobalDecl(varDecl.name, varDecl.type, varDecl.expr)
  }
  / "import" ws symbol:identifier ws "from" ws path:quotedString {
    return spec.makeImportDecl(symbol, path);
  }
  / funcDecl
  / externDecl
  / structDecl
  / enumDecl
  / moduleDecl

block "block"
  = ws head:statement tail:(ws statement)* ws {
    return spec.makeBlock([
      head,
      ...tail.map((els:any[]) => els[1])
    ]);
  }

statement "statement"
  = "let" ws varDecl:varDecl ws ";" ws {
    return spec.makeLetStatement(varDecl.name, varDecl.type, varDecl.expr);
  }
  / "reg" ws varDecl:varDecl ws ";" ws {
    return spec.makeRegStatement(varDecl.name, varDecl.type, varDecl.expr);
  }
  / ifStatement
  / whileStatement
  / "return" ws expr:expr? ws ";" ws {
    return spec.makeReturnStatement(expr);
  }
  / "{" ws block:block ws "}" ws { return block; }
  / expr:expr ws ";" ws {
    return spec.makeExprStatement(expr);
  }

varDecl "varDecl"
  = name:identifier ws type:(":" ws typeExpr)? initializer:(ws "=" ws expr:expr)? {
    return {
      name,
      type:type ? type[2] : undefined,
      expr: initializer ? initializer[3] : undefined
    };
  }

whileStatement "while statement"
  = "while" ws "(" ws condExpr:expr ws ")" ws
    "{" ws thenBlock:block? ws "}" ws {
      return spec.makeWhileStatement(
        condExpr,
        thenBlock || spec.makeBlock([])
      );
    }

ifStatement "if statement"
  = "if" ws "(" ws condExpr:expr ws ")" ws
    "{" ws thenBlock:block ws "}" ws
    elseBlock:("else" ws "{" ws block ws "}" ws)? {
    return spec.makeIfStatement(
      condExpr,
      thenBlock,
      elseBlock ? elseBlock[4] : spec.makeBlock([])
    );
  }

externDecl = "extern" ws name:identifier ws "{" ws decls:externDeclList ws "}" {
  return spec.makeExternDeclWith({
    libName: name,
    funcs: decls.map((begin:any) => {
      return spec.makeExternFuncDecl(
        begin.name,
        begin.parameters,
        begin.returnType,
      );
    })
  });
}
externDeclList = head:funcDeclBegin ws ";" tail:(ws funcDeclBegin ws ";")* {
  return [head, ...tail.map((p:any[])=> p[1])];
}
structDecl "struct declaration"
  = "struct" ws structName:identifier ws "(" ws types:typeList ws ")" ws ";" {
    return spec.makeTupleStructDecl(structName, types);
  }
  / "struct" ws structName:identifier ws "{" ws props:structPropList? ws "}" {
    return spec.makeStructDeclWith({
      symbol: structName,
      props: props || [],
    })
  }
structPropList "struct props"
  = head:structProp tail:(ws structProp)* {
    return [head, ...tail.map((p:any[]) => p[1])]
  }
structProp "struct prop"
  = name:identifier ws ":" ws type:typeExpr ws ";" {
    return spec.makeStructProp(name, type);
  }
  / funcDecl
enumDecl "enum declaration"
  = "enum" ws enumName:identifier ws "{" ws tags:enumTagList? ws "}" {
    return spec.makeEnumDeclWith({
      symbol: enumName,
      tags: tags || [],
    })
  }

enumTagList "enum tags"
  = head:enumTag tail:(ws enumTag)* {
    return [head, ...tail.map((p:any[]) => p[1])]
  }
enumTag "enum tag"
  = tagName:identifier ws type:("(" ws typeExpr ws ")")? ","? {
    return spec.makeEnumTagWith({
      symbol: tagName,
      typeExpr: type ? type[2] : undefined
    });
  }

typeList = head:typeExpr tail:(ws "," ws typeExpr)* {
  return [head, ...tail.map((p:any[]) => p[3])];
}
funcDecl = 
  pubFlag:"pub"? ws
  begin:funcDeclBegin ws "{" ws body:block? ws "}" {
    return spec.makeFuncDeclWith({
      symbol: begin.name,
      isPublic: Boolean(pubFlag),
      parameters: begin.parameters,
      returnType: begin.returnType,
      body: body || spec.makeBlock([]),
    });
  }
funcDeclBegin =
  "func" ws name:identifier ws
  "(" ws parameters:parameterList? ws ")" ws
  returns:(":" ws typeExpr)? {
  return {
    name,
    parameters: parameters || spec.makeParameterList([]),
    returnType: returns ? returns[2] : undefined,
  };
}
parameterList "parameterList"
  = head:parameter tail:(ws "," ws parameter)* ws ","? {
    return spec.makeParameterList([head, ...tail.map((p:any[]) => p[3])])
  }
parameter "parameter"
  = name:identifier ws ":" ws type:typeExpr {
    return spec.makeParameter(name, type);
  }

typeExpr "typeExpr"
  = "&" expr:typeExpr { return spec.makePointerTypeExpr(expr); }
  / "[" ws valueTypeExpr:typeExpr ws ":" ws size:digits ws"]" {
    return spec.makeArrayTypeExpr(valueTypeExpr, size);
  }
  / typeRef

typeRef "typeRef"
  = name:id { return spec.makeTypeRef(name); }

expr "expr"
  = assignment

assignment "assignment"
  = val:bool_or ws rest:(ws "=" ws bool_or)* {
    return rightAssoc(
      val,
      rest,
      ({left, right}) => spec.makeBinaryExpr(AST.BinOp.ASSIGN, left, right)
    );
  }

bool_or "bool or"
  = rest:(bool_and ws "||" ws)* val:bool_and {
    return leftAssoc(
      rest,
      val,
      ({left, right}) => spec.makeBinaryExpr(AST.BinOp.LOGICAL_OR, left, right)
    );
  }

bool_and "bool and"
  = rest:(equality ws "&&" ws)* val:equality {
    return leftAssoc(
      rest,
      val,
      ({left, right}) => spec.makeBinaryExpr(AST.BinOp.LOGICAL_AND, left, right)
    );
  }

equality "equality"
  = rest:(ordering ws ("==" / "!=") ws)* val:ordering {
    return leftAssoc(
      rest,
      val,
      ({left, right, operator}) => spec.makeBinaryExpr(
        operator === "!=" ? AST.BinOp.NOT_EQUAL_TO : AST.BinOp.EQUAL_TO,
        left,
        right
      )
    );
  }

ordering "ordering"
  = rest:(additive ws ("<" / ">") ws)* val:additive {
    return leftAssoc(
      rest,
      val,
      ({left, right, operator}) => spec.makeBinaryExpr(
        operator === "<" ? AST.BinOp.LESS_THAN : AST.BinOp.GREATER_THAN,
        left,
        right
      )
    );
  }

additive "additive"
  = rest:(term ws ("+" / "-") ws)* val:term {
    return leftAssoc(
      rest,
      val,
      ({left, right, operator}) => spec.makeBinaryExpr(
        operator === "+" ? AST.BinOp.ADD : AST.BinOp.SUB,
        left,
        right
      )
    );
  }

term "term"
  = rest:(unary ws ("*" / "/" / "%") ws)* val:unary {
    const opMap:{[s:string]: AST.BinOp} = {
      "*": AST.BinOp.MUL,
      "/": AST.BinOp.DIV,
      "%": AST.BinOp.REM,
    };

    return leftAssoc(
      rest,
      val,
      ({left, right, operator}) => {
        
        return spec.makeBinaryExpr(
          opMap[operator],
          left,
          right
        );
      }
    );
  }

unary "unary"
  = "-" ws expr:casting {
    return spec.makeUnaryExpr(AST.UnaryOp.NEG, expr);
  }
  / "!" ws expr:casting {
    return spec.makeUnaryExpr(AST.UnaryOp.LOGICAL_NOT, expr);
  }
  / casting

casting "cast"
  = expr:deref ws "as" force:"!"? ws typeExpr:typeExpr {
    return spec.makeCastExprWith({
      expr,
      typeExpr,
      force: Boolean(force),
    });
  }
  / deref

deref "deref"
  = "@" expr:calling {
    return spec.makeUnaryExpr(AST.UnaryOp.ADDR_OF, expr);
  }
  / calling


calling "calling"
  = "$" id:identifier ws "(" ws argList:exprList? ws ")" {
    return spec.makeCompilerCallExpr(id, spec.makeArgList(argList || []));
  }
  / funcExpr:indexing ws "(" ws argList:exprList? ws ")" {
    return spec.makeCallExpr(funcExpr, spec.makeArgList(argList || []));
  }
  / indexing

indexing "indexing"
  = element:memberAccess rest:(ws "[" ws expr ws "]")* {
    function build(val:any, rest:any[]):any {
      if (rest.length === 0) {
        return val;
      }
      const first = rest.shift()
      return build(
        spec.makeBinaryExpr(AST.BinOp.ARRAY_INDEX, val, first[3]),
        rest
      )
    }
    return build(element, rest);
  }
  / memberAccess

memberAccess "memberAccess"
  = rest:(factor ws (".") ws)* val:factor {
    return leftAssoc(
      rest,
      val,
      ({left, right, operator}) => spec.makeMemberAccessExpr(left, right)
    );
  }

factor "factor"
  = "(" ws inner:expr ws ")" { return inner; }
  / structLiteral
  / arrayLiteral
  / stringLiteral
  / charLiteral
  / number
  / bool
  / id

structLiteral "struct literal"
  = structName:id ws "::" ws "{" ws values:structPropValueList? ws "}" {
    return spec.makeStructLiteral(structName, values || []);
  }
  / structName:id ws "::" ws "(" ws values:exprList? ws ")" {
    values = values ?? [];
    return spec.makeStructLiteral(
      structName,
      values.map((expr:any, i:number) => spec.makeStructLiteralProp(String(i), expr))
    );
  }
structPropValueList
  = head:structPropValue tail:(ws "," ws structPropValue)* {
    return [head, ...tail.map((t:any[]) => t[3])];
  }
structPropValue
  = propName:identifier ws ":" ws expr:expr {
    return spec.makeStructLiteralProp(propName, expr);
  }

stringLiteral "string"
  = value:quotedString {
    return spec.makeStringLiteral(value);
  }

quotedString "quotedString"
  = '"' content:(('\\' .) / [^"])* '"' {
    const inner = content.map((c:any) => typeof c === "string" ? c : c.join('')).join('');
    return JSON.parse('"'+inner+'"');
  }


charLiteral "char"
  = "'" content:('\\'? .) "'" {
    let s = (content[0] || '') + content[1];
    if (s === "\\'") {
      s = "'";
    } else if (s === '"') {
      s = '\\"';
    }
    return spec.makeCharLiteral(JSON.parse('"'+s+'"').charCodeAt(0));
  }

arrayLiteral "array"
  = "[" ws value:expr ws ":" ws size:integer ws "]" {
    return spec.makeArrayLiteralWith({elements:[value], size});
  }
  / "[" ws items:exprList? ws "]" {
    return spec.makeArrayLiteralWith({elements:items || []});
  }

exprList "exprList"
  = head:expr tail:(ws "," ws expr)* { return [head, ...tail.map((t:any[])=>t[3])]; }

number "number"
  = float
  / integer

integer "integer"
  = digits:digits type:("_" ("i"/"u") ("8"/"16"/"32"/"64"))? {
    return spec.makeNumberLiteral(
      digits,
      AST.NumberLiteralType.Integer,
      type? type.slice(1).join('') : undefined
    );
  }

digits "digits"
  = digits:[0-9]+ { return parseInt(digits.join('')); }

float "float"
  = leftDigits:[0-9]+ "." rightDigits:[0-9]+ {
    return spec.makeNumberLiteral(
      parseFloat(leftDigits.join('') + '.' + rightDigits.join('')),
      AST.NumberLiteralType.Float,
      undefined
    )
  }

bool = "true" { return spec.makeBooleanLiteral(true); }
     / "false" { return spec.makeBooleanLiteral(false); }

id "symbol"
  = name:identifier rest:("::" identifier)+ {
    return spec.makeNamespacedRef([name, ...rest.map((r:any) => r[1])]);
  }
  / name:identifier {
    return spec.makeSymbolRef(name);
  }

identifier "identifier"
  = prefix:[a-z_]i suffix:[a-z0-9_]i* { return prefix+suffix.join(''); }

ws = ([ \n\t\r] / comment)*

comment = "//" [^\n]*

