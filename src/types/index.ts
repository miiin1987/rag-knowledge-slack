export interface Document {
  id: string;
  filename: string;
  original_name: string;
  file_size: number;
  page_count: number;
  department?: string; // rag7 スキーマで追加。'all' = 全部署共通
  created_at: string;
}

export interface Chunk {
  id: string;
  document_id: string;
  content: string;
  page_number: number;
  chunk_index: number;
  embedding?: number[];
  created_at: string;
}

export interface SearchResult {
  chunk_id: string;
  document_id: string;
  content: string;
  page_number: number;
  similarity: number;
  original_name: string;
  department?: string; // rag7.search_chunks() が返す部署情報
}

export interface Source {
  original_name: string;
  page_number: number;
  similarity: number;
}

export interface PageText {
  pageNumber: number;
  text: string;
}

export interface TextChunk {
  content: string;
  pageNumber: number;
  chunkIndex: number;
}
