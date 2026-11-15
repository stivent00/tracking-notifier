export interface SecretGenerator {
  /** Devuelve un secreto aleatorio criptograficamente seguro. */
  nuevoSecreto(): string;
}
