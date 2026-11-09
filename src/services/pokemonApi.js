const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

export async function fetchPokemonPage(generation, { limit, offset, signal }) {
  const response = await fetch(
    `${API_BASE_URL}/api/pokemons?generation=${generation}&limit=${limit}&offset=${offset}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch pokemons: ${response.status}`);
  }

  const data = await response.json();
  return {
    pokemons: Array.isArray(data.pokemons) ? data.pokemons : [],
    total: Number.isFinite(data.total) ? data.total : 0,
  };
}
