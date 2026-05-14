type TokenizerArg = string | number | boolean;
type TokenizerOptions = Record<string, TokenizerArg>;

export type Tokenizer = {
  name: string;
  args?: readonly TokenizerArg[];
  options?: TokenizerOptions;
};

export function unicodeWords(options?: TokenizerOptions) {
  return { name: "unicode_words", args: [], options };
}

export function simple(options?: TokenizerOptions) {
  return { name: "simple", args: [], options };
}

export function icu(options?: TokenizerOptions) {
  return { name: "icu", args: [], options };
}

export function chineseCompatible(options?: TokenizerOptions) {
  return { name: "chinese_compatible", args: [], options };
}

export function jieba(options?: TokenizerOptions) {
  return { name: "jieba", args: [], options };
}

export function lindera(
  language: "chinese" | "japanese" | "korean",
  options?: TokenizerOptions,
) {
  return { name: "lindera", args: [language], options };
}

export function literal(options?: TokenizerOptions) {
  return { name: "literal", args: [], options };
}

export function literalNormalized(options?: TokenizerOptions) {
  return { name: "literal_normalized", args: [], options };
}

export function ngram(
  minGram: number,
  maxGram: number,
  options?: TokenizerOptions,
) {
  return { name: "ngram", args: [minGram, maxGram], options };
}

export function edgeNgram(
  minGram: number,
  maxGram: number,
  options?: TokenizerOptions,
) {
  return { name: "edge_ngram", args: [minGram, maxGram], options };
}

export function regexPattern(pattern: string, options?: TokenizerOptions) {
  return { name: "regex_pattern", args: [pattern], options };
}

export function sourceCode(options?: TokenizerOptions) {
  return { name: "source_code", args: [], options };
}

export function whitespace(options?: TokenizerOptions) {
  return { name: "whitespace", args: [], options };
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

export function renderSearchTokenizer({
  name,
  args = [],
  options,
}: Tokenizer): string {
  const renderedArgs = args.map(renderOptionValue);
  for (const [key, value] of Object.entries(options ?? {})) {
    renderedArgs.push(`${key}=${renderOptionValue(value)}`);
  }

  if (renderedArgs.length === 0) {
    return name;
  }

  return `${name}(${renderedArgs.join(",")})`;
}
