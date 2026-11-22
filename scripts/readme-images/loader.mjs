// Lets plain Node run the plugin's drawing code outside Claude Code: `claude-code`
// (the engine, only reached for state atoms the drawing never calls) becomes an
// empty stand-in, and the plugin's extensionless imports find their `.ts` file.

const ENGINE = 'data:text/javascript,' + encodeURIComponent('export const atom = () => ({}); export const read = async () => undefined; export const update = async () => undefined')

export async function resolve(specifier, context, next) {
  if (specifier === 'claude-code') return { url: ENGINE, shortCircuit: true }
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../')
  if (isRelative && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await next(`${specifier}.ts`, context)
    } catch {
      // not a .ts file: let Node resolve it as written
    }
  }

  return next(specifier, context)
}
