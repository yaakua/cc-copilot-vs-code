export interface ClaudeAccount {
  accountUuid: string
  emailAddress: string
  organizationUuid: string
  organizationRole: string
  workspaceRole: string | null
  organizationName: string
  authorization?: string
}

export interface ThirdPartyAccount {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  description?: string
}

export type ProviderType = 'claude_official' | 'third_party'

export interface ServiceProvider {
  id: string
  type: ProviderType
  name: string
  accounts: ClaudeAccount[] | ThirdPartyAccount[]
  activeAccountId: string
  useProxy: boolean
}

export interface AppSettings {
  proxyConfig: {
    enabled: boolean
    url: string
    auth?: {
      username: string
      password: string
    }
  }
  apiProviders: Array<{
    id: string
    name: string
    baseUrl: string
    apiKey: string
  }>
  activeProviderId: string
  serviceProviders: ServiceProvider[]
  activeServiceProviderId: string
}

export const defaultSettings: AppSettings = {
  proxyConfig: {
    enabled: false,
    url: 'http://127.0.0.1:1087'
  },
  apiProviders: [],
  activeProviderId: '',
  serviceProviders: [],
  activeServiceProviderId: ''
}