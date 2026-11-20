// Owned exception-mapping primitive; no consumer, JDBC or coroutine scheduler runs.
import java.sql.SQLException
import kotlin.coroutines.cancellation.CancellationException

fun narrow(): String = try {
    throw CancellationException("owned cancellation")
} catch (failure: SQLException) {
    "database-error"
}

fun broad(): String = try {
    throw CancellationException("owned cancellation")
} catch (failure: Throwable) {
    "database-error"
}

fun main() {
    val propagated = try { narrow(); false } catch (failure: CancellationException) { true }
    check(propagated && broad() == "database-error")
    println("{\"narrowPropagates\":true,\"broadMapsCancellationToDatabaseError\":true}")
}
