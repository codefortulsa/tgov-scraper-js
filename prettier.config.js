/** @typedef {import("@ianvs/prettier-plugin-sort-imports").PluginConfig} SortImportsConfig */
/** @typedef {import("prettier").Config} PrettierConfig */

const assets = [
  "css",
  "sass",
  "scss",
  "less",
  "styl",
  "svg",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "eot",
  "otf",
  "ttf",
  "woff",
  "woff2",
  "mp4",
  "webm",
  "wav",
  "mp3",
  "m4a",
  "aac",
  "oga",
];

const frameworks = ["encore", "prisma", "~encore"];

const importOrder = /** @satisfies {SortImportsConfig["importOrder"]} */ (
  /** @type {const} */ ([
    "^(?!@welldone-software).*?(wdyr|why-did-you-render|whyDidYouRender).*?$", // why-did-you-render is always first
    `^.*\\.+(${assets.join("|")})$`, // assets should always be top-most (why-did-you-render excepted), as they may have side effects
    " ",
    "<BUILTIN_MODULES>", // node builtins
    " ",
    "^\\.", // relative imports
    "^#", // aliased packages (e.g. workspaces)
    " ",
    `^@?(${frameworks.join("|")})(/.+)?$`,
    " ",
    `^(${frameworks.join("|")})[^/]+.*?$`, // framework ecosystem packages
    " ",
    "^@\\w", // other scoped packages
    "<THIRD_PARTY_MODULES>", // other third party modules
    // everything should be sorted by now, but just in case...
    ".*?",
  ])
);

export default /** @satisfies {PrettierConfig & SortImportsConfig} */ ({
  experimentalTernaries: true,
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  importOrderParserPlugins: ["typescript", "jsx", "importAssertions"],
  importOrder,
  overrides: [
    {
      files: ["*.json", "*.jsonc", "*.json5", "encore.app"],
      options: {
        parser: "json",
        trailingComma: "none",
      },
    },
  ],
});
