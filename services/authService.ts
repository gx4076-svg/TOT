
import { User, SavedItem } from '../types';

const USERS_KEY = 'tcm_users';
const CURRENT_USER_KEY = 'tcm_current_user_id';

// Helper to get all users
const getUsers = (): User[] => {
    try {
        const usersStr = localStorage.getItem(USERS_KEY);
        return usersStr ? JSON.parse(usersStr) : [];
    } catch (e) {
        return [];
    }
};

// Helper to save users
const saveUsers = (users: User[]) => {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const authService = {
    // Check if a user is currently logged in (persisted session)
    getCurrentUser: (): User | null => {
        const currentId = localStorage.getItem(CURRENT_USER_KEY);
        if (!currentId) return null;
        const users = getUsers();
        return users.find(u => u.id === currentId) || null;
    },

    register: (nickname: string, password: string, avatar: string, avatarColor: string): { success: boolean; message: string; user?: User } => {
        const users = getUsers();
        if (users.some(u => u.nickname === nickname)) {
            return { success: false, message: '该昵称已被使用' };
        }

        const newUser: User = {
            id: Date.now().toString(),
            nickname,
            password,
            avatar,
            avatarColor,
            createdAt: new Date().toLocaleString(),
            lastLogin: new Date().toLocaleString(),
            savedItems: []
        };

        users.push(newUser);
        saveUsers(users);
        localStorage.setItem(CURRENT_USER_KEY, newUser.id);
        
        return { success: true, message: '注册成功', user: newUser };
    },

    login: (nickname: string, password: string): { success: boolean; message: string; user?: User } => {
        const users = getUsers();
        const user = users.find(u => u.nickname === nickname && u.password === password);
        
        if (!user) {
            return { success: false, message: '账号或密码错误' };
        }

        // Update last login
        user.lastLogin = new Date().toLocaleString();
        saveUsers(users);
        localStorage.setItem(CURRENT_USER_KEY, user.id);

        return { success: true, message: '登录成功', user };
    },

    logout: () => {
        localStorage.removeItem(CURRENT_USER_KEY);
    },

    updateUserData: (updatedUser: User) => {
        const users = getUsers();
        const index = users.findIndex(u => u.id === updatedUser.id);
        if (index !== -1) {
            users[index] = updatedUser;
            saveUsers(users);
        }
    },

    // Admin functions
    getAllUsers: (): User[] => {
        return getUsers();
    },

    deleteUser: (userId: string) => {
        let users = getUsers();
        users = users.filter(u => u.id !== userId);
        saveUsers(users);
    }
};
