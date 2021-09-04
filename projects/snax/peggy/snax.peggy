{{
  import * as AST from '../snax-ast';
  import * as spec from '../spec-gen';
  function makeInteger(o:string[]) {
    return parseInt(o.join(""), 10);
  }
}}

{
  if (options.multiplier) {
    input = "(" + input + ")*(" + options.multiplier + ")";
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
    let funcs: spec.FuncDecl[] = [];
    let globals: spec.GlobalDecl[] = [];
    let mainFuncBody = [];
    for (const statement of statements??[]) {
      if (spec.isFuncDecl(statement)) {
        funcs.push(statement);
      } else if (spec.isGlobalDecl(statement)) {
        globals.push(statement);
      } else {
        mainFuncBody.push(statement);
      }
    }
    if (mainFuncBody.length > 0) {
      let lastStatement = mainFuncBody[mainFuncBody.length-1];
      if (spec.isExprStatement(lastStatement)) {
        mainFuncBody[mainFuncBody.length-1] = spec.makeReturnStatement(
          lastStatement.fields.expr
        );
      }
    }
    funcs.push(
      spec.makeFuncDecl('main', spec.makeParameterList([]), null, spec.makeBlock(mainFuncBody)))
    return spec.makeFile(
      funcs,
      globals,
    );
  }

fileStatementList "file statements"
  = head:fileStatement tail:(ws fileStatement)* {
    return [head, ...tail.map((t:any)=>t[1])];
  }

fileStatement "file statement"
  = "global" ws varDecl:varDecl ws ";" ws {
    return spec.makeGlobalDecl(varDecl.name, varDecl.type, varDecl.expr)
  }
  / funcDecl
  / statement

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
  = name:identifier ws type:(":" ws typeExpr)? ws "=" ws expr:expr {
    return {name, type:type ? type[2] : null, expr};
  }

whileStatement "while statement"
  = "while" ws "(" ws condExpr:expr ws ")" ws
    "{" ws thenBlock:block ws "}" ws {
      return spec.makeWhileStatement(
        condExpr,
        thenBlock
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

funcDecl = "func" ws name:identifier ws "(" ws parameters:parameterList? ws ")" ws "{" ws body:block? ws "}" {
    return spec.makeFuncDecl(
      name,
      parameters || spec.makeParameterList([]),
      null,
      body || spec.makeBlock([]),
    );
  }
parameterList "parameterList"
  = head:parameter tail:(ws "," ws parameter)* {
    return spec.makeParameterList([head, ...tail.map((p:any[]) => p[3])])
  }
parameter "parameter"
  = name:identifier ws ":" ws type:typeExpr {
    return spec.makeParameter(name, type);
  }

typeExpr "typeExpr"
  = "&" expr:typeExpr { return spec.makePointerTypeExpr(expr); }
  / typeRef

typeRef "typeRef"
  = name:identifier { return spec.makeTypeRef(name); }

expr "expr"
  = assignment

assignment "assignment"
  = left:bool_or ws "=" ws right:bool_or {
    return spec.makeBinaryExpr(AST.BinaryOp.ASSIGN, left, right);
  }
  / bool_or

bool_or "bool or"
  = left:bool_and ws "||" ws right:bool_and {
    return spec.makeBinaryExpr(AST.BinaryOp.LOGICAL_OR, left, right);
  }
  / bool_and

bool_and "bool and"
  = left:equality ws "&&" ws right:equality {
    return spec.makeBinaryExpr(AST.BinaryOp.LOGICAL_AND, left, right);
  }
  / equality

equality "equality"
  = left:ordering ws op:("==" / "!=") ws right:ordering {
    return spec.makeBinaryExpr(
      op === "!=" ? AST.BinaryOp.NOT_EQUAL_TO : AST.BinaryOp.EQUAL_TO,
      left,
      right
    );
  }
  / ordering

ordering "ordering"
  = left:additive ws op:("<" / ">") ws right:additive {
    return spec.makeBinaryExpr(
      op==="<" ? AST.BinaryOp.LESS_THAN : AST.BinaryOp.GREATER_THAN,
      left,
      right
    );
  }
  / additive

additive "additive"
  = left:term ws right:(ws ("+" / "-") ws term)* {
    return right.reduce((result: spec.Expression, element: any[]) => {
      let op = element[1] === "+" ? AST.BinaryOp.ADD : AST.BinaryOp.SUB;
      return spec.makeBinaryExpr(op, result, element[3]);
    }, left);
  }
  / term

term "term"
  = left:casting ws right:(ws ("*" / "/") ws casting)* {
    return right.reduce((result: spec.Expression, element: any[]) => {
      let op = element[1] === "*" ? AST.BinaryOp.MUL : AST.BinaryOp.DIV;
      return spec.makeBinaryExpr(op, result, element[3]);
    }, left);
  }
  / casting

casting "cast"
  = value:calling ws "as" ws typeExpr:typeExpr {
    return spec.makeCastExpr(value, typeExpr);
  }
  / calling

calling "calling"
  = funcExpr:indexing ws "(" ws argList:exprList? ws ")" {
    return spec.makeCallExpr(funcExpr, spec.makeArgList(argList || []));
  }
  / indexing

indexing "indexing"
  = element:deref ws "[" ws index:expr ws "]" {
    return spec.makeBinaryExpr(AST.BinaryOp.ARRAY_INDEX, element, index);
  }
  / deref

deref "deref"
  = "@" expr:factor {
    return spec.makeUnaryExpr(AST.UnaryOp.DEREF, expr);
  }
  / factor

factor "factor"
  = "(" inner:expr ")" { return inner; }
  / arrayLiteral
  / stringLiteral
  / number
  / bool
  / id

stringLiteral "string"
  = '"' content:(('\\' .) / [^"])* '"' {
    const inner = content.map((c:any) => typeof c === "string" ? c : c.join('')).join('');
    return spec.makeStringLiteral(JSON.parse('"'+inner+'"'));
  }

arrayLiteral "array"
  = "[" ws items:exprList? ws "]" { return spec.makeArrayLiteral(items || []); }

exprList "exprList"
  = head:expr tail:(ws "," ws expr)* { return [head, ...tail.map((t:any[])=>t[3])]; }

number "number"
  = float
  / integer

integer "integer"
  = digits:[0-9]+ type:("_" ("i"/"u") ("8"/"16"/"32"/"64"))? {
    return spec.makeNumberLiteral(
      parseInt(digits.join('')),
      AST.NumberLiteralType.Integer,
      type? type.slice(1).join('') : null
    );
  }

float "float"
  = leftDigits:[0-9]+ "." rightDigits:[0-9]+ {
    return spec.makeNumberLiteral(
      parseFloat(leftDigits.join('') + '.' + rightDigits.join('')),
      AST.NumberLiteralType.Float,
      null
    )
  }

bool = "true" { return spec.makeBooleanLiteral(true); }
     / "false" { return spec.makeBooleanLiteral(false); }

id "symbol"
  = name:identifier { return spec.makeSymbolRef(name); }

identifier "identifier"
  = prefix:[a-z_]i suffix:[a-z0-9_]i* { return prefix+suffix.join(''); }

ws = ([ \n\t\r] / comment)*

comment = "//" [^\n]*

