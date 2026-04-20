import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '@/services/socket';
import { productsApi, type ProductDetail } from '@/services/productsApi';

interface UseProductsOpts {
  includeInactive?: boolean;
  search?: string;
}

interface UseProductsReturn {
  products: ProductDetail[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useProducts({ includeInactive, search }: UseProductsOpts = {}): UseProductsReturn {
  const [products, setProducts] = useState<ProductDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef<() => void>(() => {});

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await productsApi.list({
        ...(includeInactive ? {} : { isActive: 'true' }),
        ...(search ? { search } : {}),
      });
      setProducts(data);
    } finally {
      setLoading(false);
    }
  }, [includeInactive, search]);

  fetchRef.current = refresh;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live: any stock change from another user updates our view.
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
      const handler = (payload: { variantId: string; stock?: number }) => {
        if (payload.stock === undefined) {
          // Unknown new value — force a full refresh.
          fetchRef.current();
          return;
        }
        setProducts((prev) =>
          prev.map((p) => ({
            ...p,
            variants: p.variants.map((v) =>
              v.id === payload.variantId ? { ...v, stock: payload.stock as number } : v,
            ),
          })),
        );
      };
      socket.on('stock:updated', handler);
      return () => {
        socket?.off('stock:updated', handler);
      };
    } catch {
      // socket not ready
    }
  }, []);

  return { products, loading, refresh };
}
