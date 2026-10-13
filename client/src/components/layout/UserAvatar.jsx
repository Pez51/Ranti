import { useState } from 'react';
import { User } from 'lucide-react';
import { apiAssetUrl } from '../../lib/api';

export default function UserAvatar({ user }) {
  const [failedSource, setFailedSource] = useState(null);
  const source = apiAssetUrl(user?.avatar_url);
  return source && source !== failedSource
    ? <img src={source} alt="Foto de perfil" className="w-full h-full object-cover"
        onError={() => setFailedSource(source)} />
    : <User aria-hidden="true" size={24} />;
}
