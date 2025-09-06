export interface Card {
    id: number;
    list_id: number;
    name: string;
    created_at: string;
    owner: number;
    is_archived: boolean;
}

export interface List {
    id: number;
    name: string;
    position: number;
    cards: Card[];
}

export interface Board {
    id: number;
    name: string;
    owner: number;
    is_public: boolean;
    background_url: string;
}
