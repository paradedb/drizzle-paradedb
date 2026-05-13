type TokenizerArg = string | number | boolean;
type TokenizerOptions = Record<string, TokenizerArg>;

export type Tokenizer = {
  name: string;
  args?: readonly TokenizerArg[];
  options?: TokenizerOptions;
};

export function makeTokenizer(name: string, args: readonly TokenizerArg[] = [], options?: TokenizerOptions): Tokenizer {
  return { name, args, options };
}

export const tokenizer = {
  unicodeWords: (options?: TokenizerOptions) => makeTokenizer("unicode_words", [], options),
  simple: (options?: TokenizerOptions) => makeTokenizer("simple", [], options),
  icu: (options?: TokenizerOptions) => makeTokenizer("icu", [], options),
  literal: (options?: TokenizerOptions) => makeTokenizer("literal", [], options),
  literalNormalized: (options?: TokenizerOptions) => makeTokenizer("literal_normalized", [], options),
  ngram: (minGram: number, maxGram: number, options?: TokenizerOptions) =>
    makeTokenizer("ngram", [minGram, maxGram], options),
  edgeNgram: (minGram: number, maxGram: number, options?: TokenizerOptions) =>
    makeTokenizer("edge_ngram", [minGram, maxGram], options),
};

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


export function renderTokenizer({ name, args = [], options }: Tokenizer): string {
  const renderedArgs = args.map(renderArg);
  for (const [key, value] of Object.entries(options ?? {})) {
    renderedArgs.push(quote(`${key}=${renderOptionValue(value)}`));
  }

  if (renderedArgs.length === 0) {
    return `pdb.${name}`;
  }

  return `pdb.${name}(${renderedArgs.join(",")})`;
}
