// A tela inicial mudou de endereço: virou a raiz do sistema ("/"), porque
// quem entra no site tem que cair na área de trabalho com os aplicativos, e
// não num painel de números.
//
// Esta rota continua existindo só como ponte: link antigo, atalho salvo pelo
// dono no navegador e a barra de endereço digitada na mão ainda caem de pé.
// `permanentRedirect` (308) e não `redirect` (307) porque a mudança é
// definitiva — o navegador pode guardar.

import { permanentRedirect } from "next/navigation";

export default function InicioAntigo() {
  permanentRedirect("/");
}
