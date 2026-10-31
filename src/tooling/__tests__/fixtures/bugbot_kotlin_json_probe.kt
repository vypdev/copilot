@file:OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)

// Optional independently authored probe; not part of mandatory Node CI.
// Kotlin compiler/plugin 2.0.21; run separately with serialization 1.6.3 and 1.7.3.
// No consumer source, generated consumer serializer, corpus text or private data.
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json

@Serializable data class OwnedRequest(val name: String, val nullable: String?)
@Serializable data class OwnedDefault(val name: String, val nullable: String? = "fallback")

fun main() {
    val defaultJson = Json { explicitNulls = true }
    val implicitJson = Json(defaultJson) { explicitNulls = false }
    val omitted = implicitJson.decodeFromString<OwnedRequest>("""{"name":"Owned"}""")
    val explicit = implicitJson.decodeFromString<OwnedRequest>("""{"name":"Owned","nullable":null}""")
    check(omitted == explicit && omitted.nullable == null)
    println("implicit_nullable_omission_equals_explicit_null=passed")

    check(runCatching { defaultJson.decodeFromString<OwnedRequest>("""{"name":"Owned"}""") }.exceptionOrNull() is SerializationException)
    println("explicit_nullable_omission_rejected=passed")
    check(runCatching { implicitJson.decodeFromString<OwnedRequest>("""{"nullable":null}""") }.exceptionOrNull() is SerializationException)
    println("implicit_nonnullable_omission_rejected=passed")
    check(runCatching { implicitJson.decodeFromString<OwnedRequest>("""{"name":null}""") }.exceptionOrNull() is SerializationException)
    println("implicit_nonnullable_null_rejected=passed")

    check(implicitJson.decodeFromString<OwnedDefault>("""{"name":"Owned"}""").nullable == "fallback")
    println("implicit_nullable_default_preserved=passed")
    check(defaultJson.decodeFromString<OwnedDefault>("""{"name":"Owned"}""").nullable == "fallback")
    println("explicit_nullable_default_preserved=passed")
    check(implicitJson.decodeFromString<OwnedDefault>("""{"name":"Owned","nullable":null}""").nullable == null)
    println("implicit_nullable_explicit_null_overrides_default=passed")

    val inheritedJson = Json(implicitJson) { ignoreUnknownKeys = true }
    check(inheritedJson.decodeFromString<OwnedRequest>("""{"name":"Owned"}""").nullable == null)
    println("inherited_implicit_policy=passed")
}
