export type TagType = 'general' | 'artist' | 'unknown' | 'copyright' | 'character' | 'species';
export type TagClass = 'tags' | 'locked_tags';

export const tagTypeMap: TagType[] = ['general', 'artist', 'unknown', 'copyright', 'character', 'species'];

export type FileURLKeys = 'file_url' | 'sample_url' | 'preview_url';
export type FileDownloadedKeys = 'file_downloaded' | 'sample_downloaded' | 'preview_downloaded';
export type FileDeletedKeys = 'file_deleted' | 'sample_deleted' | 'preview_deleted';
export type FileSizeKeys = 'file_size' | 'sample_size' | 'preview_size';

export type APINestedTags = {
    [P in TagType]?: string[];
};

export interface APIFileInfo {
    size: number;
    url: string;
    height: number;
    width: number;
}

type APITagsField = APINestedTags | string[] | string;

export type BasePost = {
    id: number;
    sources?: string[];
    source?: string;
    children?: string | string[];
};

export interface APIPost extends BasePost {
    tags?: APITagsField;
    locked_tags?: APITagsField;

    created_at: string;

    file: APIFileInfo;
    preview: APIFileInfo;
    sample: APIFileInfo;
}

export type ESPost = BasePost & {
    [P in FileURLKeys]?: string;
} & {
    [P in FileSizeKeys]?: number;
} & {
    [P in FileDownloadedKeys]: boolean;
} & {
    [P in FileDeletedKeys]: boolean;
} & {
    tags: string[];
    locked_tags: string[];

    tags_general: string[];
    tags_artist: string[];
    tags_unknown: string[];
    tags_copyright: string[];
    tags_character: string[];
    tags_species: string[];

    locked_tags_general: string[];
    locked_tags_artist: string[];
    locked_tags_unknown: string[];
    locked_tags_copyright: string[];
    locked_tags_character: string[];
    locked_tags_species: string[];

    created_at: string;
}

export interface ESItem {
    _id: string;
    _source: ESPost;
}
