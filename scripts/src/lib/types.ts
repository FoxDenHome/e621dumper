export type TagType = 'general' | 'artist' | 'unknown' | 'copyright' | 'character' | 'species';
export type TagClass = 'tags' | 'locked_tags';

export const tagTypeMap: TagType[] = ['general', 'artist', 'unknown', 'copyright', 'character', 'species'];

export type FileURLKeys = 'file_url' | 'sample_url' | 'preview_url';
export type FileDownloadedKeys = 'file_downloaded' | 'sample_downloaded' | 'preview_downloaded';
export type FileDeletedKeys = 'file_deleted' | 'sample_deleted' | 'preview_deleted';
export type FileSizeKeys = 'file_size' | 'sample_size' | 'preview_size';

export interface APINestedTags {
    general?: string[];
    artist?: string[];
    unknown?: string[];
    copyright?: string[];
    character?: string[];
    species?: string[];
}

export interface PostDate {
    s: number;
    n: number;
}

type APITagsField = APINestedTags | string[] | string;

export interface BasePost {
    id: number;
    sources?: string[];
    source?: string;
    children?: string | string[];

    file_url: string;
    sample_url: string;
    preview_url: string;
    file_size: number;
    sample_size?: number;
    preview_size?: number;
}

export interface APIPost extends BasePost {
    tags?: APITagsField;
    locked_tags?: APITagsField;

    created_at: PostDate;
}

export interface ESPost extends BasePost {
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

    file_downloaded: boolean;
    sample_downloaded: boolean;
    preview_downloaded: boolean;
    file_deleted: boolean;
    sample_deleted: boolean;
    preview_deleted: boolean;
}

export interface ESItem {
    _id: string;
    _source: ESPost;
}
