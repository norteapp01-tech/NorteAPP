import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

/**
 * Campo numérico que deixa APAGAR de verdade.
 *
 * Um `<input type="number" value={n}>` controlado por número não consegue
 * ficar vazio: apagar vira `0`, o zero fica preso na frente e digitar "7" dá
 * "07". Aqui o texto digitado é do próprio campo — vazio é um estado válido
 * enquanto se digita — e só números completos viram valor. Ao entrar no campo
 * o conteúdo fica selecionado, então digitar já substitui.
 */
export function NumberField({
  value,
  onValue,
  onEmpty,
  integer = false,
  ...rest
}: {
  value: number;
  /** Chamado a cada número válido digitado. */
  onValue: (value: number) => void;
  /** Chamado quando o campo é esvaziado. Quem guarda um rascunho precisa saber,
   * senão confirmaria o valor antigo que já não está na tela. */
  onEmpty?: () => void;
  integer?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode">) {
  const [text, setText] = useState(String(value));
  const focused = useRef(false);

  // Mudança vinda de fora (outra tela, "repetir série 1") só entra quando o
  // campo não está sendo digitado — senão o cursor pularia.
  useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode={integer ? "numeric" : "decimal"}
      value={text}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        if (e.currentTarget.value.trim() === "") setText(String(value));
        rest.onBlur?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (raw.trim() === "") return void onEmpty?.();
        const parsed = integer ? parseInt(raw, 10) : parseFloat(raw);
        if (Number.isFinite(parsed)) onValue(parsed);
      }}
    />
  );
}
