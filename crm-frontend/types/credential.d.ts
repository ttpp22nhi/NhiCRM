interface PasswordCredentialData {
  id: string
  password: string
  name?: string
  iconURL?: string
}

declare class PasswordCredential extends Credential {
  constructor(data: PasswordCredentialData)
  readonly password: string
  readonly name: string
  readonly iconURL: string
}

declare global {
  interface Window {
    PasswordCredential?: typeof PasswordCredential
  }
}

export {}
