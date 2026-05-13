type TokenizerArg = string | number | boolean;
type TokenizerOptions = Record<string, TokenizerArg>;

export type Tokenizer = {
  name: string;
  args?: readonly TokenizerArg[];
  options?: TokenizerOptions;
};

export function makeTokenizer(
  name: string,
  args: readonly TokenizerArg[] = [],
  options?: TokenizerOptions,
): Tokenizer {
  return { name, args, options };
}

export function unicodeWords(options?: TokenizerOptions) {
  return makeTokenizer("unicode_words", [], options);
}
export function simple(options?: TokenizerOptions) {
  return makeTokenizer("simple", [], options);
}
export function icu(options?: TokenizerOptions) {
  return makeTokenizer("icu", [], options);
}
export function literal(options?: TokenizerOptions) {
  return makeTokenizer("literal", [], options);
}
export function literalNormalized(options?: TokenizerOptions) {
  return makeTokenizer("literal_normalized", [], options);
}
export function ngram(
  minGram: number,
  maxGram: number,
  options?: TokenizerOptions,
) {
  return makeTokenizer("ngram", [minGram, maxGram], options);
}
export function edgeNgram(
  minGram: number,
  maxGram: number,
  options?: TokenizerOptions,
) {
  return makeTokenizer("edge_ngram", [minGram, maxGram], options);
}

function renderArg(value: TokenizerArg): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return String(value);
  }

  return quote(value);
}

function renderOptionValue(value: TokenizerArg): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function renderTokenizer({
  name,
  args = [],
  options,
}: Tokenizer): string {
  const renderedArgs = args.map(renderArg);
  for (const [key, value] of Object.entries(options ?? {})) {
    renderedArgs.push(quote(`${key}=${renderOptionValue(value)}`));
  }

  if (renderedArgs.length === 0) {
    return `pdb.${name}`;
  }

  return `pdb.${name}(${renderedArgs.join(",")})`;
}
