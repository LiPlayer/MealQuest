import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import fs from 'node:fs'
import path from 'node:path'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

const ENV_FILE_NAME = '.env'
const LEGACY_ENV_FILES = ['.env.development', '.env.production', '.env.test']

const projectRoot = path.resolve(__dirname, '..')
const envPath = path.join(projectRoot, ENV_FILE_NAME)

const stripQuotedValue = (value: string): string => {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

const parseEnvFile = (raw: string): Record<string, string> => {
  const result: Record<string, string> = {}
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed
    const eqIndex = normalized.indexOf('=')
    if (eqIndex <= 0) {
      continue
    }
    const key = normalized.slice(0, eqIndex).trim()
    const value = stripQuotedValue(normalized.slice(eqIndex + 1))
    if (key) {
      result[key] = value
    }
  }
  return result
}

const loadCustomerEnv = (): { serverUrl: string } => {
  const legacyFiles = LEGACY_ENV_FILES.filter((fileName) =>
    fs.existsSync(path.join(projectRoot, fileName))
  )
  if (legacyFiles.length > 0) {
    throw new Error(
      `[env] 已废弃环境文件：${legacyFiles.join(', ')}。请改用 ${ENV_FILE_NAME} 单文件配置。`
    )
  }

  if (!fs.existsSync(envPath)) {
    throw new Error(
      `[env] 缺少 ${ENV_FILE_NAME}。请基于 .env.example 创建，并至少配置 TARO_APP_SERVER_URL。`
    )
  }

  const parsed = parseEnvFile(fs.readFileSync(envPath, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  const serverUrl = String(process.env.TARO_APP_SERVER_URL || '').trim()
  if (!serverUrl) {
    throw new Error('[env] TARO_APP_SERVER_URL 不能为空。')
  }
  try {
    // Validate URL format at build startup so failures are immediate.
    // eslint-disable-next-line no-new
    new URL(serverUrl)
  } catch {
    throw new Error(`[env] TARO_APP_SERVER_URL 非法：${serverUrl}`)
  }

  return { serverUrl }
}

const customerBuildEnv = loadCustomerEnv()

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge, { command: _command, mode: _mode }) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'meal-quest-customer',
    date: '2026-2-15',
    /**
     * Design reference: 750px (Standard / Retina).
     * Mini-program: px values convert to rpx at 1:1 ratio (1rpx per 1px).
     * H5: uses vw units via pxtransform so everything scales to viewport width.
     */
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 1 / 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [
      "@tarojs/plugin-generator",
      "taro-plugin-tailwind"
    ],
    defineConstants: {
      TARO_APP_SERVER_URL: JSON.stringify(customerBuildEnv.serverUrl)
    },
    copy: {
      patterns: [
      ],
      options: {
      }
    },
    framework: 'react',
    compiler: 'webpack5',
    cache: {
      enable: false // Webpack 持久化缓存配置，建议开启。默认配置请参考：https://docs.taro.zone/docs/config-detail#cache
    },
    compile: {
      prebundle: {
        enable: false
      }
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {

          }
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
      webpackChain(chain) {
        if (process.env.NODE_ENV === 'development') {
          chain.devtool('cheap-module-source-map')
        }
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      }
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js'
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      }
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
        }
      }
    }
  }


  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig)
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig)
})
