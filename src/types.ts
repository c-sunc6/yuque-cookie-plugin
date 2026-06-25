export type JsonObject = Record<string, unknown>

export interface CliFlags {
  help?: boolean
  out?: string
  lakeFile?: string
  htmlFile?: string
  markdownFile?: string
  file?: string
  afterText?: string
  title?: string
  name?: string
  description?: string
  slug?: string
  public?: boolean
  noToc?: boolean
  tocAction?: string
  targetUuid?: string
  numberHeadings?: boolean
  noNativeLake?: boolean
  dryRun?: boolean
  keepTemp?: boolean
  sessionEnv?: string
  ctokenEnv?: string
  cookieKey?: string
  cookieValue?: string
  apiHost?: string
  port?: string | number
  configOnly?: boolean
  [key: string]: string | number | boolean | undefined
}

export interface CliArgs {
  positional: string[]
  flags: CliFlags
}

export interface YuqueCredentials {
  session: string
  ctoken: string
  homeUrl?: string
  extraCookies?: Record<string, string>
  source?: string
  saved_at?: string
  updated_at?: string
  last_validated_at?: string
  last_failed_at?: string
  last_validation_error?: string
}

export interface YuqueDocFields {
  id?: number
  slug?: string
  title?: string
  format?: string
  draft_version?: number
  content_updated_at?: string
  updated_at?: string
  published_at?: string
  body?: string
  body_draft?: string
  body_asl?: string
  body_draft_asl?: string
  sourcecode?: string
  serializer?: unknown
}

export interface YuqueSnapshot {
  captured_at: string
  url: string
  book: {
    id: number
    slug?: string
    name?: string
  }
  doc: {
    id: number
    slug?: string
    title?: string
    format?: string
  }
  edit: YuqueDocFields
  markdown: YuqueDocFields
  lake: YuqueDocFields
}

export interface LakeApplyValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export interface LakeApplyPlan {
  captured_at: string
  url: string
  doc: YuqueSnapshot['doc']
  book: YuqueSnapshot['book']
  validation: LakeApplyValidation
  stats: {
    current_lake_length: number
    next_lake_length: number
    length_delta: number
    changed: boolean
  }
}

export interface SerializeHtmlToLakeOptions {
  html: string
  out?: string
  keepTemp?: boolean
}

export interface SerializeHtmlToLakeResult {
  serializer: 'official-lake-editor' | 'fallback'
  lake: string
}

export interface YuqueTocItem {
  type: string
  title: string
  uuid: string
  url?: string
  prev_uuid?: string
  sibling_uuid?: string
  child_uuid?: string
  parent_uuid?: string
  doc_id?: number
  id?: number
  level?: number
  open_window?: number
  visible?: number
}

export interface BookInfo {
  bookId: number
  bookSlug?: string
  tocList: YuqueTocItem[]
  bookName?: string
  bookDesc?: string
  host: string
  imageServiceDomains: string[]
}

export interface DocInfo {
  docId?: number
  docSlug?: string
  docTitle?: string
  bookId?: number
  bookSlug?: string
  bookName?: string
  host: string
  imageServiceDomains: string[]
}

export interface DownloadOptions {
  distDir: string
  ignoreImg: boolean
  ignoreAttachments: boolean | string
  toc: boolean
  incremental: boolean
  convertMarkdownVideoLinks: boolean
  hideFooter: boolean
  quiet: boolean
}

export interface DownloadWarning {
  type: 'image' | 'attachment' | 'media' | 'link'
  title?: string
  url?: string
  file?: string
  error: string
}

export interface DownloadWarningSummary {
  total: number
  by_type: Record<string, number>
  retryable_resources: Array<{
    type: DownloadWarning['type']
    title?: string
    url: string
    file?: string
    error: string
  }>
}

export interface DownloadResourceManifest {
  total: number
  by_type: Record<'image' | 'attachment', number>
  total_size: number
  files: Array<{
    type: 'image' | 'attachment'
    path: string
    size: number
  }>
}

export interface ProgressItem {
  path: string
  savePath?: string
  toc: YuqueTocItem
  pathIdList: string[]
  pathTitleList: string[]
  createAt?: string
  contentUpdatedAt?: string
  publishedAt?: string
  firstPublishedAt?: string
}
