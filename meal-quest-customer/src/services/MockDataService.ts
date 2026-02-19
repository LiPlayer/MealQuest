export interface StoreTheme {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
}

export interface StoreData {
    id: string;
    name: string;
    branchName: string;
    slogan: string;
    logo: string; // URL or placeholder
    theme: StoreTheme;
    isOpen: boolean;
}

const MOCK_STORES: Record<string, StoreData> = {
    'store_a': {
        id: 'store_a',
        name: '探味轩',
        branchName: '悦海园路店',
        slogan: '寻千种风味，遇百道好菜',
        logo: 'https://api.dicebear.com/9.x/icons/svg?seed=Felix',
        theme: {
            primaryColor: '#FFB100', // Amber
            secondaryColor: '#FFF8E1',
            backgroundColor: '#FAFAFA'
        },
        isOpen: true
    },
    'store_b': {
        id: 'store_b',
        name: 'Sushi Master',
        branchName: 'Ginza Tokyo',
        slogan: 'Fresh from the Ocean',
        logo: 'https://api.dicebear.com/9.x/icons/svg?seed=Sushi',
        theme: {
            primaryColor: '#FF5252', // Red
            secondaryColor: '#FFEBEE',
            backgroundColor: '#121212' // Dark mode example
        },
        isOpen: true
    },
    'store_closed': {
        id: 'store_closed',
        name: 'Midnight Diner',
        branchName: 'Back Alley',
        slogan: 'Stories and Food',
        logo: 'https://api.dicebear.com/9.x/icons/svg?seed=Moon',
        theme: {
            primaryColor: '#607D8B',
            secondaryColor: '#ECEFF1',
            backgroundColor: '#F5F5F5'
        },
        isOpen: false
    }
};

export const MockDataService = {
    getStoreById: (id: string): Promise<StoreData | null> => {
        return new Promise((resolve) => {
            // Simulate network delay
            setTimeout(() => {
                const store = MOCK_STORES[id] || MOCK_STORES['store_a']; // Fallback to A for dev convenience
                resolve(store);
            }, 500);
        });
    }
};
