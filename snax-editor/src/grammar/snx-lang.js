// This file was generated by lezer-generator. You probably shouldn't edit it.
import {LRParser} from "@lezer/lr"
import {NodeProp} from "@lezer/common"
const spec_Identifier = {__proto__:null,func:10, struct:24, return:30, while:52, reg:56, let:60}
export const parser = LRParser.deserialize({
  version: 13,
  states: ")xOYQPOOO!iQPO'#C{OOQO'#DW'#DWOOQO'#DR'#DROOQO'#C|'#C|QYQPOOO!pQPO'#C_O!uQPO'#CgO!zQPO'#CjO#YQPO'#CuO#_QPO'#CwO#dQPO'#CyOOQO'#Cp'#CpOOQO'#Cq'#CqOOQO'#Cr'#CrOOQO'#Cs'#CsOOQO'#Ct'#CtO!zQPO,59ZO!zQPO,59ZO!zQPO,59ZO!zQPO,59ZO!zQPO,59ZO!zQPO,59ZOOQO,59g,59gOOQO-E6z-E6zO#iQPO,58yO#nQPO,59RO#sQPO,59UO!zQPO,59aO#zQPO,59cO$PQPO,59eOOQO1G.u1G.uO$UQPO1G.uO$}QPO1G.uO%XQPO1G.uO&TQPO1G.uO&[QPO1G.uO&cQPO1G.eO&hQPO1G.mOOQO1G.p1G.pO&pQPO1G.{O!zQPO1G.}O!zQPO1G/PO&wQPO'#CcO&|QPO7+$PO'RQPO'#CiOOQO'#C}'#C}O'WQPO7+$XOOQO7+$X7+$XO'`QPO7+$gO'eQPO7+$iO'lQPO7+$kO'sQPO,58}O'`QPO<<GkO'sQPO,59TOOQO-E6{-E6{OOQO<<Gs<<GsOYQPO'#CfOOQO<<HR<<HROOQO<<HT<<HTOOQO<<HV<<HVOOQO'#Cd'#CdOOQO1G.i1G.iOOQOAN=VAN=VO'xQPO1G.oO'}QPO,59QOOQO7+$Z7+$ZOOQO1G.l1G.l",
  stateData: "(U~OtOSPOS~OSQOTUO[VO_WO`QOaQObQOjXOlYOnZO~O{[O|[O}bO!O]O!P]O!Q^O!R^O!S_O!T`O~OygO~PzOSiO~OSjO~OSQO`QOaQObQO~OUlO~OSmO~OSnO~OUuO~OxvO~OywO~PzO}yO~O}zO~OyciXci~PzO{[O|[Oyci}ci!Qci!Rci!Sci!TciXci~O!Oci!Pci~P$`O!O]O!P]O~P$`O{[O|[O!O]O!P]O!Q^O!R^Oyci}ci!TciXci~O!Sci~P%cO!S_O~P%cOS{O~OS}Ow!QO~OX!RO~PzOv!UO~OX!VO~Ov!WO~OS}Ow!YO~Ox!ZO~Oy!]O~PzOy!^O~PzOS!_O~Oy!dO~Ow!eO~PYO",
  goto: "%X{PPP|PPP!S!VP!]|P!c|PPPP!g!w#T#`#j#s|P|P|P|#{$VPPP$]PPPP$cXROT!Z!cR|uQ!`!UR!b!WQ![!RR!a!VT!Ov!PmQOTWabcdeflyz!Z!ceaPkpqrstx!S!TccPkprstx!S!TadPkpstx!S!T_ePkptx!S!T]fPkpx!S!TQTOShT!cR!c!ZQ!PvR!X!PXSOT!Z!cWPOT!Z!cQkWQoaQpbQqcQrdQseQtfQxlQ!SyR!Tz",
  nodeNames: "⚠ LineComment File FuncDecl Identifier func ( ParameterList TypeExpr ) Block StructDecl struct StructPropDecl ReturnStatement return String Boolean Number BinaryExpression ArithOp CompareOp CompareOp LogicOp LogicOp WhileStatement while RegStatement reg LetStatement let ExprStatement",
  maxTerm: 51,
  nodeProps: [
    [NodeProp.group, -7,3,11,14,25,27,29,31,"Statement"]
  ],
  skippedNodes: [0,1],
  repeatNodeCount: 2,
  tokenData: "'O~RiXY!pYZ!p]^!ppq!pqr#Rrs#^st#{vw$Zxy$fyz$k{|$p}!O$u!P!Q$z!Q![%]![!]%e!]!^%j!^!_%o!_!`%t!`!a&R!c!}&W#R#S&W#T#o&W#o#p&i#p#q&n#q#r&y~!uSt~XY!pYZ!p]^!ppq!p~#UP!_!`#X~#^O!R~~#aTOr#^rs#ps#O#^#O#P#u#P~#^~#uO`~~#xPO~#^~$OQ#Y#Z$U#h#i$U~$ZOa~~$^Pvw$a~$fO!S~~$kOU~~$pOX~~$uO{~~$zO|~~$}P!P!Q%Q~%VQP~OY%QZ~%Q~%bPb~!Q![%]~%jOv~~%oOy~~%tO!O~~%yP}~!_!`%|~&RO!Q~~&WO!P~~&]SS~!Q![&W!c!}&W#R#S&W#T#o&W~&nOx~~&qP#p#q&t~&yO!T~~'OOw~",
  tokenizers: [0],
  topRules: {"File":[0,2]},
  specialized: [{term: 4, get: value => spec_Identifier[value] || -1}],
  tokenPrec: 0
})