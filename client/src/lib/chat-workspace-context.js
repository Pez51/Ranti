import { createContext,useContext } from 'react';
export const ChatWorkspaceContext=createContext(null);
export const useChatWorkspace=()=>useContext(ChatWorkspaceContext);
