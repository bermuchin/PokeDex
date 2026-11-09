import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPokemonPage } from '../services/pokemonApi';

const PAGE_SIZE = 30;

function mergePokemons(previous, next) {
  return Array.from(
    new Map([...previous, ...next].map((pokemon) => [pokemon.id, pokemon])).values(),
  ).sort((a, b) => a.id - b.id);
}

export function usePokemonList(generation) {
  const cacheRef = useRef(new Map());
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);
  const isFetchingRef = useRef(false);
  const [pokemons, setPokemons] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState(null);

  const fetchPage = useCallback(async (requestedOffset, replace = false) => {
    if (!generation || isFetchingRef.current) return;

    const requestId = requestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current?.abort();
    abortControllerRef.current = controller;
    isFetchingRef.current = true;
    setIsFetching(true);
    if (replace) setIsLoading(true);
    setError(null);

    try {
      const page = await fetchPokemonPage(generation, {
        limit: PAGE_SIZE,
        offset: requestedOffset,
        signal: controller.signal,
      });

      if (requestId !== requestIdRef.current || controller.signal.aborted) return;

      setPokemons((previous) => {
        const merged = mergePokemons(replace ? [] : previous, page.pokemons);
        cacheRef.current.set(generation, { pokemons: merged, total: page.total });
        return merged;
      });
      setTotal(page.total);
    } catch (fetchError) {
      if (fetchError.name !== 'AbortError' && requestId === requestIdRef.current) {
        setError('포켓몬 리스트를 불러오는데 실패했습니다.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsFetching(false);
        isFetchingRef.current = false;
        setIsLoading(false);
      }
    }
  }, [generation]);

  useEffect(() => {
    requestIdRef.current += 1;
    abortControllerRef.current?.abort();
    isFetchingRef.current = false;
    setIsFetching(false);
    setError(null);

    if (!generation) {
      setPokemons([]);
      setTotal(0);
      setIsLoading(false);
      setIsFetching(false);
      isFetchingRef.current = false;
      return undefined;
    }

    const cached = cacheRef.current.get(generation);
    if (cached) {
      setPokemons(cached.pokemons);
      setTotal(cached.total);
      setIsLoading(false);
      setIsFetching(false);
      isFetchingRef.current = false;
    } else {
      setPokemons([]);
      setTotal(0);
      setIsLoading(true);
    }

    return undefined;
  }, [generation]);

  useEffect(() => {
    if (!generation || cacheRef.current.has(generation)) return undefined;
    fetchPage(0, true);
    return undefined;
  }, [generation, fetchPage]);

  const loadMore = useCallback(() => {
    if (!generation || isFetching || pokemons.length >= total) return;
    fetchPage(pokemons.length);
  }, [fetchPage, generation, isFetching, pokemons.length, total]);

  return {
    pokemons,
    isLoading,
    isFetching,
    hasMore: pokemons.length < total,
    error,
    loadMore,
  };
}
