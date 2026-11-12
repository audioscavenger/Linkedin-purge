const dashPlugin = {
  meta: {
    name: "dash",
  },
  rules: {
    "no-unicode-dash": {
      meta: {
        type: "problem",
        docs: {
          description:
            "disallow en/em dashes in comments; use a hyphen '-' instead",
        },
        fixable: "whitespace",
        schema: [],
      },
      create(context) {
        const sourceCode = context.sourceCode;
        return {
          Program() {
            for (const comment of sourceCode.getAllComments()) {
              if (/[\u2013\u2014]/.test(comment.value)) {
                context.report({
                  node: comment,
                  message: "Use hyphen '-' instead of en/em dash in comments",
                  fix(fixer) {
                    const replacement = comment.value.replace(
                      /[\u2013\u2014]/g,
                      "-"
                    );
                    return fixer.replaceText(
                      comment,
                      comment.type === "Block"
                        ? `/*${replacement}*/`
                        : `//${replacement}`
                    );
                  },
                });
              }
            }
          },
        };
      },
    },
  },
};

export default dashPlugin;
