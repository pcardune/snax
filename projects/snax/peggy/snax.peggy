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
  = block
  / statement
  / expr

block
  = head:statement tail:(ws statement)* {
    return new AST.Block([
      head,
      ...tail.map((els:any[]) => els[1])
    ]);
  }

statement
  = "let" ws name:identifier ws type:(":" ws typeExpr)? ws "=" ws expr:expr ws ";" {
    return new AST.LetStatement(name, type ? type[2] : null, expr);
  }
  / expr:expr ws ";" {
    return new AST.ExprStatement(expr);
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

bool_and "bool op"
  = left:additive ws "&&" ws right:additive {
    return new AST.Expression(AST.BinaryOp.LOGICAL_AND, left, right);
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
  = left:indexing ws right:(ws ("*" / "/") ws indexing)* {
    return right.reduce((result: AST.ASTNode, element: any[]) => {
      let op = element[1] === "*" ? AST.BinaryOp.MUL : AST.BinaryOp.DIV;
      return new AST.Expression(op, result, element[3]);
    }, left);
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
  = head:expr tail:(ws "," ws expr)* { return [head, ...tail.map(t=>t[3])]; }

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