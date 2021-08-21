<script src="/main.js"></script>

# Grammars

Here is a standard expression grammar showing how operator
precedence works.

<script>
  nfaExplore.render.GrammarPlayground({
    initialGrammar:
    `NUM = r"[0-9]+"
NAME = r"[a-zA-Z_][a-zA-Z_0-9]"

Root = [Expr]
Expr = [Expr "+" Term]
     | [Expr "-" Term]
     | [Term]
Term = [Term "*" Factor]
     | [Term "/" Factor]
     | [Factor]
Factor = ["(" Expr ")"]
       | [NUM]
       | [NAME]
`,
    initialContent:`3+4`,
  });
</script>
