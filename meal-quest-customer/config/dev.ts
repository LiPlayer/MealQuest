import type { UserConfigExport } from "@tarojs/cli"

export default {
  logger: {
    quiet: false,
    stats: true
  },
  mini: {},
  h5: {
    devServer: {
      host: '0.0.0.0'
    }
  }
} satisfies UserConfigExport<'webpack5'>
