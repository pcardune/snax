{{
  import * as AST from '../snax-ast';
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
  / ws { return new AST.Block([]); }

file "file"
  = ws statements:fileStatementList? ws {
    let funcs: AST.FuncDecl[] = [];
    let globals: AST.GlobalDecl[] = [];
    let mainFuncBody = [];
    for (const statement of statements??[]) {
      if (statement instanceof AST.FuncDecl) {
        funcs.push(statement);
      } else if (statement instanceof AST.GlobalDecl) {
        globals.push(statement);
      } else {
        mainFuncBody.push(statement);
      }
    }
    if (mainFuncBody.length > 0) {
      let lastStatement = mainFuncBody[mainFuncBody.length-1];
      if (lastStatement instanceof AST.ExprStatement) {
        mainFuncBody[mainFuncBody.length-1] = new AST.ReturnStatement(
          lastStatement.expr
        );
      }
    }
    funcs.push(
      new AST.FuncDecl('main', {
        body: new AST.Block(mainFuncBody)
      }))
    return new AST.File({
      funcs,
      globals,
    })
  }

fileStatementList "file statements"
  = head:fileStatement tail:(ws fileStatement)* {
    return [head, ...tail.map(t=>t[1])];
  }

fileStatement "file statement"
  = "global" ws varDecl:varDecl ws ";" ws {
    return new AST.GlobalDecl(varDecl.name, varDecl.type, varDecl.expr)
  }
  / funcDecl
  / statement

block "block"
  = ws head:statement tail:(ws statement)* ws {
    return new AST.Block([
      head,
      ...tail.map((els:any[]) => els[1])
    ]);
  }

statement "statement"
  = "let" ws varDecl:varDecl ws ";" ws {
    return new AST.LetStatement(varDecl.name, varDecl.type, varDecl.expr);
  }
  / ifStatement
  / whileStatement
  / "return" ws expr:expr? ws ";" ws {
    return new AST.ReturnStatement(expr);
  }
  / "{" ws block:block ws "}" ws { return block; }
  / expr:expr ws ";" ws {
    return new AST.ExprStatement(expr);
  }

varDecl "varDecl"
  = name:identifier ws type:(":" ws typeExpr)? ws "=" ws expr:expr {
    return {name, type:type ? type[2] : null, expr};
  }

whileStatement "while statement"
  = "while" ws "(" ws condExpr:expr ws ")" ws
    "{" ws thenBlock:block ws "}" ws {
      return new AST.WhileStatement(
        condExpr,
        thenBlock
      );
    }

ifStatement "if statement"
  = "if" ws "(" ws condExpr:expr ws ")" ws
    "{" ws thenBlock:block ws "}" ws
    elseBlock:("else" ws "{" ws block ws "}" ws)? {
    return new AST.IfStatement(
      condExpr,
      thenBlock,
      elseBlock ? elseBlock[4] : new AST.Block([])
    );
  }

funcDecl = "func" ws name:identifier ws "(" ws parameters:parameterList? ws ")" ws "{" ws body:block? ws "}" {
    return new AST.FuncDecl(name, {parameters, body});
  }
parameterList "parameterList"
  = head:parameter tail:(ws "," ws parameter)* {
    return new AST.ParameterList([head, ...tail.map((p:any[]) => p[3])])
  }
parameter "parameter"
  = name:identifier ws ":" ws type:typeExpr {
    return new AST.Parameter(name, type);
  }

typeExpr "typeExpr"
  = typeRef: typeRef { return new AST.TypeExpr(typeRef); }

typeRef "typeRef"
  = name:identifier { return new AST.TypeRef(name); }

expr "expr"
  = assignment

assignment "assignment"
  = left:bool_or ws "=" ws right:bool_or {
    return new AST.Expression(AST.BinaryOp.ASSIGN, left, right);
  }
  / bool_or

bool_or "bool or"
  = left:bool_and ws "||" ws right:bool_and {
    return new AST.Expression(AST.BinaryOp.LOGICAL_OR, left, right);
  }
  / bool_and

bool_and "bool and"
  = left:equality ws "&&" ws right:equality {
    return new AST.Expression(AST.BinaryOp.LOGICAL_AND, left, right);
  }
  / equality

equality "equality"
  = left:ordering ws op:("==" / "!=") ws right:ordering {
    return new AST.Expression(
      op === "!=" ? AST.BinaryOp.NOT_EQUAL_TO : AST.BinaryOp.EQUAL_TO,
      left,
      right
    );
  }
  / ordering

ordering "ordering"
  = left:additive ws op:("<" / ">") ws right:additive {
    return new AST.Expression(
      op==="<" ? AST.BinaryOp.LESS_THAN : AST.BinaryOp.GREATER_THAN,
      left,
      right
    );
  }
  / additive

additive "additive"
  = left:term ws right:(ws ("+" / "-") ws term)* {
    return right.reduce((result: AST.ASTNode, element: any[]) => {
      let op = element[1] === "+" ? AST.BinaryOp.ADD : AST.BinaryOp.SUB;
      return new AST.Expression(op, result, element[3]);
    }, left);
  }
  / term

term "term"
  = left:calling ws right:(ws ("*" / "/") ws calling)* {
    return right.reduce((result: AST.ASTNode, element: any[]) => {
      let op = element[1] === "*" ? AST.BinaryOp.MUL : AST.BinaryOp.DIV;
      return new AST.Expression(op, result, element[3]);
    }, left);
  }
  / calling

calling "calling"
  = funcExpr:indexing ws "(" ws argList:exprList? ws ")" {
    return new AST.Expression(AST.BinaryOp.CALL, funcExpr, new AST.ArgList(argList || []));
  }
  / indexing

indexing "indexing"
  = element:factor ws "[" ws index:expr ws "]" {
    return new AST.Expression(AST.BinaryOp.ARRAY_INDEX, element, index);
  }
  / factor

factor "factor"
  = "(" inner:expr ")" { return inner; }
  / arrayLiteral
  / number
  / bool
  / id

arrayLiteral "array"
  = "[" ws items:exprList? ws "]" { return new AST.ArrayLiteral(items || []); }

exprList "exprList"
  = head:expr tail:(ws "," ws expr)* { return [head, ...tail.map((t:any[])=>t[3])]; }

number "number"
  = float
  / integer

integer "integer"
  = digits:[0-9]+ { return new AST.NumberLiteral(parseInt(digits.join(''))); }

float "float"
  = leftDigits:[0-9]+ "." rightDigits:[0-9]+ {
    return new AST.NumberLiteral(
      parseFloat(leftDigits.join('') + '.' + rightDigits.join('')),
      AST.NumberLiteralType.Float
    )
  }

bool = "true" { return new AST.BooleanLiteral(true); }
     / "false" { return new AST.BooleanLiteral(false); }

id "symbol"
  = name:identifier { return new AST.SymbolRef(name); }

identifier "identifier"
  = prefix:[a-z_]i suffix:[a-z0-9_]i* { return prefix+suffix.join(''); }

ws = [ \n\t\r]*